"""Tests API pagos."""

import io
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from config.settings import get_settings
from domain.enums import CrossingStatus, DocumentStatus, PaymentStatus
from infrastructure.persistence.database import SessionLocal, init_db
from infrastructure.persistence.models import AccountCrossingModel, DocumentModel, ProviderModel


def _make_image_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (50, 50), color=(200, 200, 200)).save(buf, format="JPEG")
    return buf.getvalue()


def _seed_crossing(db: Session) -> AccountCrossingModel:
    provider = ProviderModel(nombre="Hotel Pago Test", nit="900555666")
    doc = DocumentModel(
        filename="factura-pago.jpg",
        tipo="FACTURA",
        origen="CARGA_MANUAL",
        estado=DocumentStatus.APROBADO,
        numero_documento="FP-001",
        total=750000.0,
        provider=provider,
    )
    db.add(provider)
    db.add(doc)
    db.flush()
    crossing = AccountCrossingModel(
        document_id=doc.id,
        match_type="MATCH_EXACTO",
        match_score=95.0,
        estado=CrossingStatus.APROBADO,
        proveedor_nombre="Hotel Pago Test",
        numero_compra="CP-001",
        numero_reserva="RS-001",
        valor_documento=750000.0,
        valor_autobits=750000.0,
        diferencia=0.0,
    )
    db.add(crossing)
    db.commit()
    db.refresh(crossing)
    return crossing


@pytest.fixture
def client():
    get_settings.cache_clear()
    init_db()
    from api_server import app

    return TestClient(app)


def test_payment_flow(client):
    db = SessionLocal()
    try:
        crossing = _seed_crossing(db)
        crossing_id = crossing.id
    finally:
        db.close()

    create = client.post("/api/payments", json={"crossing_id": crossing_id})
    assert create.status_code == 200
    payment = create.json()
    assert payment["estado"] == PaymentStatus.PENDIENTE_APROBACION
    payment_id = payment["id"]

    approve = client.post(f"/api/payments/{payment_id}/approve", json={"usuario": "ANDREA"})
    assert approve.status_code == 200
    assert approve.json()["estado"] == PaymentStatus.PENDIENTE_PAGO

    paid = client.post(
        f"/api/payments/{payment_id}/mark-paid",
        json={"usuario": "ANDREA", "observaciones": "Pagado en Bancolombia"},
    )
    assert paid.status_code == 200
    assert paid.json()["estado"] == PaymentStatus.PAGADO

    img = _make_image_bytes()
    receipt = client.post(
        f"/api/payments/{payment_id}/receipt",
        files={"archivo": ("comprobante.jpg", img, "image/jpeg")},
        data={"contramarcado": "true", "usuario": "ANDREA"},
    )
    assert receipt.status_code == 200
    assert receipt.json()["estado"] == PaymentStatus.COMPLETADO
    assert receipt.json()["has_receipt"] is True

    listing = client.get("/api/payments")
    assert listing.status_code == 200
    assert listing.json()["total"] >= 1

    export = client.get("/api/payments/export/pending")
    assert export.status_code == 200


def test_payment_rejects_unapproved_crossing(client):
    db = SessionLocal()
    try:
        provider = ProviderModel(nombre="X", nit="1")
        doc = DocumentModel(
            filename="x.jpg",
            tipo="FACTURA",
            origen="CARGA_MANUAL",
            estado=DocumentStatus.EXTRAIDO,
            provider=provider,
        )
        db.add(provider)
        db.add(doc)
        db.flush()
        crossing = AccountCrossingModel(
            document_id=doc.id,
            match_type="SIN_MATCH",
            estado=CrossingStatus.PENDIENTE,
            proveedor_nombre="X",
        )
        db.add(crossing)
        db.commit()
        cid = crossing.id
    finally:
        db.close()

    response = client.post("/api/payments", json={"crossing_id": cid})
    assert response.status_code == 400
