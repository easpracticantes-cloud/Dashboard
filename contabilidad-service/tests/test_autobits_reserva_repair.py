"""Codigo Reserva del Excel Autobits no debe perderse en el cruce."""

import sys
from pathlib import Path

from openpyxl import Workbook

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from application.services.autobits_service import AutobitsService  # noqa: E402
from domain.autobits.fields import (  # noqa: E402
    AUTOBITS_EXPORT_COLUMNS,
    com_from_excel_record,
    com_from_value,
    prefer_canonical_columns,
    suggest_mapping,
    value_from_row_dict,
)
from infrastructure.autobits.excel_adapter import ExcelAutobitsAdapter  # noqa: E402


def test_suggest_mapping_incluye_codigo_reserva_completo():
    mapping = suggest_mapping(list(AUTOBITS_EXPORT_COLUMNS))
    assert mapping["numero_reserva"] == "Codigo Reserva"
    assert mapping["numero_compra"] == "Codigo Orden de compra"


def test_prefer_canonical_overrides_wrong_ai_mapping():
    columns = list(AUTOBITS_EXPORT_COLUMNS)
    bad = {
        "numero_reserva": "Codigo Factura proveedor",
        "numero_compra": "Referencia (Orden de Compra)",
    }
    fixed = prefer_canonical_columns(bad, columns)
    assert fixed["numero_reserva"] == "Codigo Reserva"
    assert fixed["numero_compra"] == "Codigo Orden de compra"


def test_value_from_raw_codigo_reserva():
    raw = {
        "Codigo Orden de compra": "COM007441",
        "Codigo Reserva": " EAS002722",
        "Nombre concepto": "Almuerzo",
    }
    assert AutobitsService._value_from_raw(raw, "codigo reserva") == "EAS002722"
    assert (
        AutobitsService._value_from_raw(raw, "codigo orden de compra", "orden de compra")
        == "COM007441"
    )
    assert AutobitsService._value_from_raw(raw, "com") is None


def test_parse_reads_reserva_even_with_bad_mapping(tmp_path):
    wb = Workbook()
    ws = wb.active
    ws.append(
        [
            "NIT/CC Proveedor (Orden de Compra)",
            "Nombre Proveedor (Orden de Compra)",
            "Codigo Orden de compra",
            "Codigo Reserva",
            "Total",
            "Codigo Factura proveedor",
        ]
    )
    ws.append(["9001", "Hotel Demo", "COM007441", " EAS002722", 17000, " "])
    path = tmp_path / "ab.xlsx"
    wb.save(path)

    mapping = {
        "proveedor": "Nombre Proveedor (Orden de Compra)",
        "nit": "NIT/CC Proveedor (Orden de Compra)",
        "numero_compra": "Codigo Orden de compra",
        "numero_reserva": "Codigo Factura proveedor",
        "valor": "Total",
    }
    parsed = ExcelAutobitsAdapter().parse(path, mapping)
    assert len(parsed.rows) == 1
    assert parsed.rows[0].numero_reserva == "EAS002722"
    assert parsed.rows[0].numero_compra == "COM007441"


def test_value_from_row_dict():
    row = {"Codigo Reserva": " EAS1", "Otra": "x"}
    assert str(value_from_row_dict(row, "codigo reserva")).strip() == "EAS1"


def test_com_from_value_never_invoice():
    assert com_from_value("COM007441") == "COM007441"
    assert com_from_value("FE-6920") is None
    assert com_from_value("FPFL-26895186") is None
    assert com_from_value("HIN36005") is None


class _Row:
    def __init__(self, compra, raw):
        self.numero_compra = compra
        self.numero_reserva = None
        self.raw_json = raw


def test_com_from_excel_record_prefers_canonical_com():
    import json

    raw = json.dumps({
        "Codigo Orden de compra": "COM007441",
        "Codigo Factura proveedor": "FPFL-26895186",
    })
    rec = _Row("FPFL-26895186", raw)
    assert com_from_excel_record(rec) == "COM007441"
