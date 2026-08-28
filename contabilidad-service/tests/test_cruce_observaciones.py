"""Tests: observaciones Autobits → estado de cruce."""

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
from domain.autobits.observaciones import infer_crossing_status, resolve_crossing_estado
from domain.enums import CrossingStatus
from infrastructure.ai.excel_ai_analyzer import ExcelAIAnalysis
from infrastructure.persistence.database import init_db


def test_infer_cdc_enviada_es_aprobado():
    assert infer_crossing_status("CDC ENVIADA")[0] == CrossingStatus.APROBADO


def test_extract_obs_from_columna_30():
    from domain.autobits.observaciones import extract_observaciones_from_raw

    raw = {
        "Columna_28": "X",
        "Columna_29": None,
        "Columna_30": "SE PAGO EN EFECTIVO",
    }
    assert extract_observaciones_from_raw(raw) == "SE PAGO EN EFECTIVO"
    assert infer_crossing_status(extract_observaciones_from_raw(raw))[0] == CrossingStatus.PAGADO


def test_infer_pendiente_y_vacio():
    assert infer_crossing_status("pendiente")[0] == CrossingStatus.PENDIENTE
    assert infer_crossing_status(None)[0] == CrossingStatus.PENDIENTE
    assert infer_crossing_status("")[0] == CrossingStatus.PENDIENTE
    assert infer_crossing_status("  ")[0] == CrossingStatus.PENDIENTE


def test_resolve_prioriza_fecha_pago_y_factura():
    assert (
        resolve_crossing_estado(
            factura_cdc=None,
            fecha_pago="2026-08-01",
            observaciones="pendiente",
        )
        == CrossingStatus.PAGADO
    )
    assert (
        resolve_crossing_estado(
            factura_cdc="FV 1",
            fecha_pago=None,
            observaciones="efectivo",
        )
        == CrossingStatus.APROBADO
    )
    assert (
        resolve_crossing_estado(
            factura_cdc=None,
            fecha_pago=None,
            observaciones="efectivo",
        )
        == CrossingStatus.PAGADO
    )


def _xlsx_con_obs() -> bytes:
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
    ws.append(["900111", "Hotel Demo SAS", "COM-OBS-001", "EAS001", "2026-08-20", 150000, "pendiente"])
    ws.append(["900222", "Hotel Cash SAS", "COM-OBS-002", "EAS002", "2026-08-21", 200000, "Paso en efectivo"])
    ws.append(["900333", "Hotel Vacio SAS", "COM-OBS-003", "EAS003", "2026-08-22", 50000, None])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture
def client():
    get_settings.cache_clear()
    init_db()
    from api_server import app

    return TestClient(app)


def test_seed_respeta_observaciones_autobits(client):
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
            "observaciones": "OBSERVACIONES",
            "estado_compra": None,
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
                    _xlsx_con_obs(),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
            data={"auto_cruzar": "true"},
        )
    assert up.status_code == 200

    items = client.get("/api/crossings?limit=50").json()["items"]
    by_oc = {i["numero_compra"]: i for i in items}

    assert by_oc["COM-OBS-001"]["estado"] == "PENDIENTE"
    assert by_oc["COM-OBS-001"]["observaciones"] == "pendiente"

    assert by_oc["COM-OBS-002"]["estado"] == "PAGADO"
    assert "efectivo" in (by_oc["COM-OBS-002"]["observaciones"] or "").lower()

    assert by_oc["COM-OBS-003"]["estado"] == "PENDIENTE"
    assert by_oc["COM-OBS-003"]["observaciones"] in (None, "")

    # Re-seed no debe romper estados ya inferidos
    sync = client.post("/api/crossings/seed-from-autobits", json={"usuario": "ANDREA"})
    assert sync.status_code == 200
    assert sync.json().get("updated") is not None
    again = {i["numero_compra"]: i for i in client.get("/api/crossings?limit=50").json()["items"]}
    assert again["COM-OBS-002"]["estado"] == "PAGADO"
    assert again["COM-OBS-001"]["observaciones"] == "pendiente"
