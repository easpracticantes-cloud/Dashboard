"""Tests del adaptador Excel Autobits."""

import io
import sys
from pathlib import Path

import pytest
from openpyxl import Workbook

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from domain.autobits.fields import suggest_mapping
from infrastructure.autobits.excel_adapter import ExcelAutobitsAdapter


def _build_sample_xlsx() -> Path:
    wb = Workbook()
    ws = wb.active
    ws.title = "Reporte"
    ws.append(
        [
            "Proveedor",
            "NIT",
            "Compra",
            "Reserva",
            "No. Factura",
            "Valor",
            "Fecha",
            "Concepto",
        ]
    )
    ws.append(
        [
            "Hotel Andino SAS",
            "900123456",
            "C-1001",
            "R-550",
            "FE-7788",
            850000,
            "2026-08-20",
            "Hospedaje grupo",
        ]
    )
    ws.append(["", "", "", "", "", "", "", ""])
    path = Path(__file__).parent / "_tmp_autobits.xlsx"
    wb.save(path)
    return path


@pytest.fixture
def sample_xlsx():
    path = _build_sample_xlsx()
    yield path
    path.unlink(missing_ok=True)


def test_suggest_mapping_detects_spanish_columns():
    columns = ["Proveedor", "NIT", "Compra", "Reserva", "Valor"]
    mapping = suggest_mapping(columns)
    assert mapping["proveedor"] == "Proveedor"
    assert mapping["nit"] == "NIT"
    assert mapping["numero_compra"] == "Compra"
    assert mapping["valor"] == "Valor"


def test_suggest_mapping_real_autobits_export_columns():
    """Columnas reales del Excel Autobits del usuario."""
    from domain.autobits.fields import AUTOBITS_EXPORT_COLUMNS

    mapping = suggest_mapping(list(AUTOBITS_EXPORT_COLUMNS))
    assert mapping["nit"] == "NIT/CC Proveedor (Orden de Compra)"
    assert mapping["proveedor"] == "Nombre Proveedor (Orden de Compra)"
    assert mapping["numero_compra"] == "Codigo Orden de compra"
    assert mapping["numero_reserva"] == "Codigo Reserva"
    assert mapping["fecha"] == "Fecha de ejecución (Reserva)"
    assert mapping["concepto"] == "Nombre concepto"
    assert mapping["valor"] == "Total"
    assert mapping["observaciones"] == "OBSERVACIONES"
    assert mapping["estado_compra"] == "estado de la compra"
    # No deben mapearse a campos internos
    assert mapping["numero_documento"] is None


def test_excel_adapter_preview_and_parse(sample_xlsx):
    adapter = ExcelAutobitsAdapter()
    preview = adapter.preview(sample_xlsx)
    assert preview.total_rows == 1
    assert "Proveedor" in preview.columns
    assert preview.suggested_mapping["proveedor"] == "Proveedor"

    parsed = adapter.parse(sample_xlsx, preview.suggested_mapping)
    assert len(parsed.rows) == 1
    row = parsed.rows[0]
    assert row.proveedor == "Hotel Andino SAS"
    assert row.nit == "900123456"
    assert row.numero_compra == "C-1001"
    assert row.valor == 850000.0
    assert parsed.skipped_empty == 0
