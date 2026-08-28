"""Tests: cruce vinculado al último Excel Autobits."""

import io
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from config.settings import get_settings
from infrastructure.ai.excel_ai_analyzer import ExcelAIAnalysis
from infrastructure.persistence.database import init_db


def _xlsx(rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(
        [
            "NIT/CC Proveedor (Orden de Compra)",
            "Nombre Proveedor (Orden de Compra)",
            "Codigo Orden de compra",
            "Codigo Reserva",
            "Fecha de ejecución (Reserva)",
            "Total",
            "OBSERVACIONES",
        ]
    )
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _fake_analysis():
    return ExcelAIAnalysis(
        mapping={
            "proveedor": "Nombre Proveedor (Orden de Compra)",
            "nit": "NIT/CC Proveedor (Orden de Compra)",
            "numero_compra": "Codigo Orden de compra",
            "numero_reserva": "Codigo Reserva",
            "numero_documento": None,
            "valor": "Total",
            "fecha": "Fecha de ejecución (Reserva)",
            "concepto": None,
            "observaciones": "OBSERVACIONES",
        },
        period_start="2026-08-16",
        period_end="2026-08-22",
        mode="ia",
        sheet_notes="test",
    )


@pytest.fixture
def client():
    get_settings.cache_clear()
    init_db()
    from api_server import app

    return TestClient(app)


def _upload(client, rows):
    with patch(
        "application.services.autobits_service.ExcelAIAnalyzer.analyze",
        return_value=_fake_analysis(),
    ):
        return client.post(
            "/api/autobits/upload",
            files={
                "archivo": (
                    "autobits.xlsx",
                    _xlsx(rows),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
            data={"auto_cruzar": "true"},
        )


def test_seed_uses_latest_batch_only(client):
    up1 = _upload(client, [["900111", "Hotel A", "COM001", "EAS001", "2026-08-20", 100000, ""]])
    assert up1.status_code == 200
    batch1 = up1.json()["batch"]["id"]

    up2 = _upload(
        client,
        [["900222", "Hotel B", "COM002", "EAS002", "2026-08-21", 200000, "pendiente"]],
    )
    assert up2.status_code == 200
    batch2 = up2.json()["batch"]["id"]
    assert batch2 != batch1

    ctx = client.get("/api/crossings/context")
    assert ctx.status_code == 200
    assert ctx.json()["batch"]["id"] == batch2

    listing = client.get(f"/api/crossings?batch_id={batch2}")
    assert listing.status_code == 200
    items = listing.json()["items"]
    assert len(items) == 1
    assert items[0]["numero_compra"] == "COM002"


def test_reimport_updates_crossing_preserving_factura(client):
    up = _upload(client, [["900111", "Hotel Demo", "COM001", "EAS001", "2026-08-20", 150000, ""]])
    assert up.status_code == 200

    listing = client.get("/api/crossings")
    row = next(i for i in listing.json()["items"] if i["numero_compra"] == "COM001")
    done = client.patch(
        f"/api/crossings/{row['id']}/complete",
        json={"factura_cdc": "FV POS 999", "fecha_pago": ""},
    )
    assert done.status_code == 200
    assert done.json()["factura_cdc"] == "FV POS 999"
    assert done.json()["estado"] == "APROBADO"

    up2 = _upload(
        client,
        [["900111", "Hotel Demo", "COM001", "EAS001", "2026-08-20", 155000, "cdc enviada"]],
    )
    assert up2.status_code == 200

    sync = client.post("/api/crossings/seed-from-autobits", json={"use_latest": True})
    assert sync.status_code == 200
    assert sync.json()["updated"] >= 1

    refreshed = client.get(f"/api/crossings/{row['id']}")
    assert refreshed.status_code == 200
    data = refreshed.json()
    assert data["factura_cdc"] == "FV POS 999"
    assert data["valor_autobits"] == 155000
