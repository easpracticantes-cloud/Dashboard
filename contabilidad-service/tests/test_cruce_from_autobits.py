"""Tests cruce de cuentas desde Autobits (sin archivos de factura)."""

import io
import json
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


def _xlsx() -> bytes:
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
        ]
    )
    ws.append(["900111", "Hotel Demo SAS", "COM001", "EAS001", "2026-08-20", 150000])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture
def client():
    get_settings.cache_clear()
    init_db()
    from api_server import app

    return TestClient(app)


def test_seed_and_complete_cruce_from_autobits(client):
    fake = ExcelAIAnalysis(
        mapping={
            "proveedor": "Nombre Proveedor (Orden de Compra)",
            "nit": "NIT/CC Proveedor (Orden de Compra)",
            "numero_compra": "Codigo Orden de compra",
            "numero_reserva": "Codigo Reserva",
            "numero_documento": None,
            "valor": "Total",
            "fecha": "Fecha de ejecución (Reserva)",
            "concepto": None,
        },
        period_start="2026-08-16",
        period_end="2026-08-22",
        mode="ia",
        sheet_notes="test",
    )
    with patch(
        "application.services.autobits_service.ExcelAIAnalyzer.analyze",
        return_value=fake,
    ):
        up = client.post(
            "/api/autobits/upload",
            files={
                "archivo": (
                    "autobits.xlsx",
                    _xlsx(),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
            data={"auto_cruzar": "true"},
        )
    assert up.status_code == 200
    assert up.json()["crossing"]["created"] >= 1

    listing = client.get("/api/crossings")
    assert listing.status_code == 200
    items = listing.json()["items"]
    assert len(items) >= 1
    row = next(i for i in items if i["numero_compra"] == "COM001")
    assert row["estado"] == "PENDIENTE"
    assert row["proveedor"] == "Hotel Demo SAS"
    assert row["factura_cdc"] in (None, "")

    done = client.patch(
        f"/api/crossings/{row['id']}/complete",
        json={"factura_cdc": "FV POS 12345", "fecha_pago": "2026-08-25"},
    )
    assert done.status_code == 200
    assert done.json()["estado"] == "PAGADO"
    assert done.json()["factura_cdc"] == "FV POS 12345"
    assert done.json()["fecha_pago"] == "2026-08-25"
