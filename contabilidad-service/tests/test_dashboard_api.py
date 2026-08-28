"""Tests API dashboard y reportes."""

import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from config.settings import get_settings
from domain.enums import DocumentStatus, PaymentStatus
from infrastructure.persistence.database import SessionLocal, init_db
from infrastructure.persistence.models import DocumentModel, PaymentModel, ProviderModel


def _seed_data(db: Session) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    provider = ProviderModel(nombre="Dash Test", nit="900000111")
    doc = DocumentModel(
        filename="dash.jpg",
        tipo="FACTURA",
        origen="CARGA_MANUAL",
        estado=DocumentStatus.APROBADO,
        total=1000000.0,
        received_at=now,
        provider=provider,
    )
    db.add(provider)
    db.add(doc)
    db.flush()
    payment = PaymentModel(
        document_id=doc.id,
        proveedor="Dash Test",
        valor=1000000.0,
        estado=PaymentStatus.PENDIENTE_PAGO,
        created_at=now,
    )
    db.add(payment)
    db.commit()


@pytest.fixture
def client():
    get_settings.cache_clear()
    init_db()
    from api_server import app

    return TestClient(app)


def test_dashboard_kpis_and_reports(client):
    db = SessionLocal()
    try:
        _seed_data(db)
    finally:
        db.close()

    weeks = client.get("/api/dashboard/weeks")
    assert weeks.status_code == 200
    assert len(weeks.json()["weeks"]) >= 1

    kpis = client.get("/api/dashboard/kpis")
    assert kpis.status_code == 200
    data = kpis.json()
    assert "conteos" in data
    assert "totales" in data
    assert data["conteos"]["documentos_recibidos"] >= 1

    docs_csv = client.get("/api/reports/documents.csv")
    assert docs_csv.status_code == 200
    assert "filename" in docs_csv.text

    html = client.get("/api/reports/semanal.html")
    assert html.status_code == 200
    assert "Reporte semanal" in html.text
