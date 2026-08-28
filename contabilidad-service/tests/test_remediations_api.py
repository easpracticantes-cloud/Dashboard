"""Tests API subsanaciones."""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from config.settings import get_settings
from domain.enums import DocumentStatus, RemediationStatus, RemediationType
from infrastructure.persistence.database import SessionLocal, init_db
from infrastructure.persistence.models import DocumentModel, ProviderModel, RemediationModel


def _seed_document(db: Session) -> DocumentModel:
    provider = ProviderModel(nombre="Proveedor Test", nit="900111222")
    doc = DocumentModel(
        filename="factura-sub.jpg",
        tipo="FACTURA",
        origen="CARGA_MANUAL",
        estado=DocumentStatus.EXTRAIDO,
        numero_documento="F-100",
        total=500000.0,
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


def test_remediations_crud(client):
    db = SessionLocal()
    try:
        doc = _seed_document(db)
        doc_id = doc.id
    finally:
        db.close()

    create = client.post(
        "/api/remediations",
        json={
            "document_id": doc_id,
            "tipo_problema": RemediationType.OTRO,
            "descripcion": "Falta soporte adjunto",
            "responsable": "ANDREA",
            "fecha_limite": "2026-09-01",
        },
    )
    assert create.status_code == 200
    created = create.json()
    assert created["estado"] == RemediationStatus.PENDIENTE
    rem_id = created["id"]

    listing = client.get("/api/remediations")
    assert listing.status_code == 200
    assert listing.json()["total"] >= 1

    update = client.patch(
        f"/api/remediations/{rem_id}",
        json={"descripcion": "Falta soporte — urgente", "responsable": "KATHERINE"},
    )
    assert update.status_code == 200
    assert update.json()["responsable"] == "KATHERINE"

    estado = client.patch(
        f"/api/remediations/{rem_id}/estado",
        json={"estado": RemediationStatus.EN_PROCESO},
    )
    assert estado.status_code == 200
    assert estado.json()["estado"] == RemediationStatus.EN_PROCESO

    delete = client.delete(f"/api/remediations/{rem_id}")
    assert delete.status_code == 200


def test_remediations_catalog(client):
    response = client.get("/api/remediations/catalog")
    assert response.status_code == 200
    data = response.json()
    assert len(data["types"]) >= 1
    assert RemediationStatus.PENDIENTE in data["statuses"]


def test_remediations_rejects_invalid_document(client):
    response = client.post(
        "/api/remediations",
        json={
            "document_id": 999999,
            "tipo_problema": RemediationType.OTRO,
            "descripcion": "Test",
        },
    )
    assert response.status_code == 404
