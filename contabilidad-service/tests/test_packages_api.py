"""Tests paquetes digitales y storage."""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from config.settings import get_settings
from domain.enums import DocumentStatus, PackageStatus
from infrastructure.persistence.database import SessionLocal, init_db
from infrastructure.persistence.models import DocumentModel, ProviderModel
from infrastructure.storage.local_storage_provider import LocalStorageProvider


def _seed_document_with_file(db: Session, tmp_path: Path) -> DocumentModel:
    img_path = tmp_path / "factura_pkg.jpg"
    Image.new("RGB", (80, 80), color=(100, 150, 200)).save(img_path, format="JPEG")

    provider = ProviderModel(nombre="Paquete Test SAS", nit="900777888")
    doc = DocumentModel(
        filename="factura_pkg.jpg",
        tipo="FACTURA",
        origen="CARGA_MANUAL",
        estado=DocumentStatus.COMPROBANTE_RECIBIDO,
        numero_documento="PKG-001",
        total=600000.0,
        storage_path=str(img_path),
        provider=provider,
    )
    db.add(provider)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@pytest.fixture
def client():
    get_settings.cache_clear()
    init_db()
    from api_server import app

    return TestClient(app)


def test_storage_provider_and_status(client):
    local = LocalStorageProvider()
    info = local.info()
    assert info["provider"] == "local"
    assert "FACTURA" in info["folder_types"]

    response = client.get("/api/packages/storage/status")
    assert response.status_code == 200
    data = response.json()
    assert data["active_provider"] == "local"
    assert data["google_drive"]["message"] == "Integración no configurada"


def test_package_create_generate_download(client, tmp_path):
    db = SessionLocal()
    try:
        doc = _seed_document_with_file(db, tmp_path)
        doc_id = doc.id
    finally:
        db.close()

    create = client.post(
        "/api/packages",
        json={"document_id": doc_id, "responsable": "KATHERINE"},
    )
    assert create.status_code == 200
    package = create.json()
    assert package["estado"] == PackageStatus.PENDIENTE
    pkg_id = package["id"]

    gen = client.post(f"/api/packages/{pkg_id}/generate")
    assert gen.status_code == 200
    assert gen.json()["estado"] == PackageStatus.GENERADO
    assert gen.json()["has_zip"] is True

    download = client.get(f"/api/packages/{pkg_id}/download")
    assert download.status_code == 200
    assert download.headers["content-type"] == "application/zip"

    entregar = client.patch(
        f"/api/packages/{pkg_id}/estado",
        json={"estado": PackageStatus.ENTREGADO},
    )
    assert entregar.status_code == 200
    assert entregar.json()["estado"] == PackageStatus.ENTREGADO
