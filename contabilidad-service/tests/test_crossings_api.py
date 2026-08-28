"""Tests API de cruces."""

import io
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy.orm import Session

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from config.settings import get_settings
from domain.enums import DocumentStatus
from infrastructure.persistence.database import SessionLocal, init_db
from infrastructure.persistence.models import DocumentModel, ProviderModel


def _make_xlsx() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(["Proveedor", "NIT", "Compra", "Reserva", "No. Factura", "Valor", "Fecha"])
    ws.append(["Hotel Andino SAS", "900123456", "C-1001", "R-550", "FE-7788", 850000, "2026-08-20"])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _seed_document(db: Session) -> DocumentModel:
    provider = ProviderModel(nombre="Hotel Andino SAS", nit="900123456")
    doc = DocumentModel(
        filename="factura-test.jpg",
        tipo="FACTURA",
        origen="CARGA_MANUAL",
        estado=DocumentStatus.EXTRAIDO,
        numero_documento="FE-7788",
        total=850000.0,
        fecha_emision="2026-08-20",
        extracted_json=json.dumps({"compra": "C-1001", "reserva": "R-550"}),
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


def test_crossing_run_and_approve(client):
    from unittest.mock import patch
    from infrastructure.ai.excel_ai_analyzer import ExcelAIAnalysis

    db = SessionLocal()
    try:
        _seed_document(db)
    finally:
        db.close()

    fake = ExcelAIAnalysis(
        mapping={
            "proveedor": "Proveedor",
            "nit": "NIT",
            "numero_compra": "Compra",
            "numero_reserva": "Reserva",
            "numero_documento": "No. Factura",
            "valor": "Valor",
            "fecha": "Fecha",
            "concepto": None,
        },
        mode="ia",
        sheet_notes="mock",
    )
    xlsx = _make_xlsx()
    with patch(
        "application.services.autobits_service.ExcelAIAnalyzer.analyze",
        return_value=fake,
    ):
        preview = client.post(
            "/api/autobits/preview",
            files={"archivo": ("reporte.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
    assert preview.status_code == 200
    preview_data = preview.json()

    imp = client.post(
        "/api/autobits/import",
        data={
            "preview_id": preview_data["preview_id"],
            "mapping_json": json.dumps(preview_data["suggested_mapping"]),
        },
    )
    assert imp.status_code == 200

    run = client.post("/api/crossings/run", json={"usuario": "ANDREA"})
    assert run.status_code == 200
    run_data = run.json()
    assert run_data["created"] >= 1

    listing = client.get("/api/crossings")
    assert listing.status_code == 200
    items = listing.json()["items"]
    assert len(items) >= 1

    crossing_id = items[0]["id"]
    if items[0]["estado"] in ("EN_REVISION", "PENDIENTE"):
        approve = client.post(f"/api/crossings/{crossing_id}/approve", json={"usuario": "ANDREA"})
        assert approve.status_code == 200
        assert approve.json()["estado"] == "APROBADO"


def test_crossing_requires_autobits(client):
    response = client.post("/api/crossings/run", json={"batch_id": 999999})
    assert response.status_code == 400
    assert "Autobits" in response.json()["detail"]
