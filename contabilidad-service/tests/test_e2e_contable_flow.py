"""Test e2e — flujo contable completo v1 (REQUISITOS_CONTABLES §8)."""

import io
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session

TESTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS_DIR.parent / "src"))
sys.path.insert(0, str(TESTS_DIR))

from config.settings import get_settings
from domain.enums import CrossingStatus, DocumentStatus, PackageStatus, PaymentStatus
from fixtures.demo_cases import make_e2e_autobits_xlsx, seed_document
from infrastructure.persistence.database import SessionLocal, init_db


def _make_image() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (60, 60), color=(180, 200, 220)).save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def client():
    get_settings.cache_clear()
    init_db()
    from api_server import app

    return TestClient(app)


def test_e2e_flujo_contable_completo(client, tmp_path):
    """
    Flujo v1:
    Autobits → cruce → aprobación → pago → comprobante → paquete → dashboard.
    """
    db = SessionLocal()
    img_path = tmp_path / "e2e_factura.jpg"
    Image.new("RGB", (100, 100), color=(120, 160, 200)).save(img_path, format="JPEG")
    try:
        doc = seed_document(
            db,
            proveedor="E2E Hotel Demo SAS",
            nit="900999888",
            numero_documento="FE-E2E-001",
            compra="E2E-C001",
            reserva="E2E-R001",
            total=850000.0,
            filename="e2e_factura.jpg",
        )
        doc.storage_path = str(img_path)
        doc.estado = DocumentStatus.EXTRAIDO
        db.commit()
        doc_id = doc.id
    finally:
        db.close()

    xlsx = make_e2e_autobits_xlsx()
    preview = client.post(
        "/api/autobits/preview",
        files={"archivo": ("semana.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert preview.status_code == 200
    pdata = preview.json()
    imp = client.post(
        "/api/autobits/import",
        data={
            "preview_id": pdata["preview_id"],
            "mapping_json": json.dumps(pdata["suggested_mapping"]),
        },
    )
    assert imp.status_code == 200

    run = client.post("/api/crossings/run", json={"usuario": "ANDREA"})
    assert run.status_code == 200
    assert run.json()["created"] >= 1

    crossings = client.get("/api/crossings").json()["items"]
    crossing = next(c for c in crossings if c["document_id"] == doc_id)
    assert crossing["estado"] in (CrossingStatus.APROBADO, CrossingStatus.EN_REVISION)

    if crossing["estado"] != CrossingStatus.APROBADO:
        approve_x = client.post(
            f"/api/crossings/{crossing['id']}/approve",
            json={"usuario": "ANDREA"},
        )
        assert approve_x.status_code == 200
        crossing["estado"] = approve_x.json()["estado"]

    assert crossing["estado"] == CrossingStatus.APROBADO

    payment_resp = client.post("/api/payments", json={"crossing_id": crossing["id"]})
    assert payment_resp.status_code == 200
    payment = payment_resp.json()
    payment_id = payment["id"]
    assert payment["estado"] == PaymentStatus.PENDIENTE_APROBACION

    client.post(f"/api/payments/{payment_id}/approve", json={"usuario": "ANDREA"})
    client.post(
        f"/api/payments/{payment_id}/mark-paid",
        json={"usuario": "ANDREA", "observaciones": "Pago manual Bancolombia"},
    )

    img = _make_image()
    receipt = client.post(
        f"/api/payments/{payment_id}/receipt",
        files={"archivo": ("comprobante.jpg", img, "image/jpeg")},
        data={"contramarcado": "true", "usuario": "ANDREA"},
    )
    assert receipt.status_code == 200
    assert receipt.json()["estado"] == PaymentStatus.COMPLETADO

    pkg_create = client.post(
        "/api/packages",
        json={"document_id": doc_id, "responsable": "KATHERINE"},
    )
    assert pkg_create.status_code == 200
    pkg_id = pkg_create.json()["id"]

    gen = client.post(f"/api/packages/{pkg_id}/generate")
    assert gen.status_code == 200
    assert gen.json()["estado"] == PackageStatus.GENERADO

    entregar = client.patch(
        f"/api/packages/{pkg_id}/estado",
        json={"estado": PackageStatus.ENTREGADO},
    )
    assert entregar.status_code == 200

    kpis = client.get("/api/dashboard/kpis")
    assert kpis.status_code == 200
    data = kpis.json()
    assert data["conteos"]["documentos_recibidos"] >= 1
    assert data["conteos"]["pagos_realizados"] >= 1

    html = client.get("/api/reports/semanal.html")
    assert html.status_code == 200
    assert "Reporte semanal" in html.text

    health = client.get("/api/health")
    assert health.status_code == 200
