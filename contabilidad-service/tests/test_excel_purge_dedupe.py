"""Tests — purge Excels y bloqueo de archivo repetido."""

import io
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from config.settings import get_settings  # noqa: E402
from infrastructure.ai.excel_ai_analyzer import ExcelAIAnalysis  # noqa: E402
from infrastructure.persistence.database import init_db  # noqa: E402


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
            "concepto": "Nombre concepto",
            "observaciones": "OBSERVACIONES",
            "estado_compra": "estado de la compra",
        },
        period_start="2026-08-16",
        period_end="2026-08-22",
        mode="ia",
        sheet_notes="test",
    )


def _vaciar_tablas():
    from infrastructure.persistence.database import engine
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys = OFF"))
        tablas = [
            row[0]
            for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
            if not row[0].startswith("sqlite_")
        ]
        for tabla in tablas:
            conn.execute(text(f'DELETE FROM "{tabla}"'))


@pytest.fixture
def client():
    get_settings.cache_clear()
    init_db()
    _vaciar_tablas()
    from api_server import app

    yield TestClient(app)
    _vaciar_tablas()


def _xlsx() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(
        [
            "NIT/CC Proveedor (Orden de Compra)",
            "Nombre Proveedor (Orden de Compra)",
            "Codigo Orden de compra",
            "Codigo Reserva",
            "Total",
            "Fecha de ejecución (Reserva)",
            "Nombre concepto",
            "OBSERVACIONES",
            "estado de la compra",
        ]
    )
    ws.append(["9001", "Proveedor A", "OC-1", "R-1", 100000, "2026-08-18", "Servicio", "", "PENDIENTE"])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_bloquea_excel_autobits_repetido(client):
    content = _xlsx()
    with patch(
        "application.services.autobits_service.ExcelAIAnalyzer.analyze",
        return_value=_fake_analysis(),
    ):
        r1 = client.post(
            "/api/autobits/upload",
            files={"archivo": ("semana.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"auto_cruzar": "false"},
        )
        assert r1.status_code == 200, r1.text
        r2 = client.post(
            "/api/autobits/upload",
            files={"archivo": ("semana.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"auto_cruzar": "false"},
        )
        assert r2.status_code == 409
        assert "ya fue importado" in (r2.json().get("detail") or "").lower()


def test_purge_excels(client):
    content = _xlsx()
    with patch(
        "application.services.autobits_service.ExcelAIAnalyzer.analyze",
        return_value=_fake_analysis(),
    ):
        r1 = client.post(
            "/api/autobits/upload",
            files={"archivo": ("semana.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"auto_cruzar": "true"},
        )
        assert r1.status_code == 200, r1.text

    bad = client.delete("/api/autobits/excels")
    assert bad.status_code == 400

    purged = client.delete("/api/autobits/excels?confirm=true")
    assert purged.status_code == 200, purged.text
    body = purged.json()
    assert body["ok"] is True
    assert body["deleted"]["batches"] >= 1

    latest = client.get("/api/autobits/batches/latest")
    assert latest.status_code == 404
