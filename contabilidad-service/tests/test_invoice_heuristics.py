"""Tests — heurísticas OCR y bloqueo de Excel duplicado."""

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from domain.services.invoice_heuristics import extract_invoice_hints, merge_hints_into_extraction  # noqa: E402


def test_extract_nit_total_fecha_factura_fisica():
    texto = """
    ESCUELA AVES SALENTO SAS
    NIT: 900123456-1
    Factura de venta No. FE-2045
    Fecha de emisión: 15/08/2026
    Subtotal  $ 100.000
    IVA 19%   $ 19.000
    TOTAL A PAGAR  $ 119.000
    """
    hints = extract_invoice_hints(texto)
    assert hints["nit_o_identificacion"].startswith("900123456")
    assert hints["numero_factura"]
    assert hints["fecha_emision"] == "2026-08-15"
    assert hints["total"] == 119000.0
    assert hints.get("impuesto") in (19000.0, None) or hints.get("impuesto", 0) >= 19


def test_extract_compra_reserva_y_fpos():
    texto = """
    Cuenta de cobro
    FPOS-16488
    COM007246   EAS002686
    Total $ 51.000
    """
    hints = extract_invoice_hints(texto)
    assert "16488" in hints.get("numero_factura", "")
    assert hints.get("compra") == "COM007246"
    assert hints.get("reserva") == "EAS002686"
    assert hints.get("total") == 51000.0


def test_merge_hints_solo_rellena_vacios():
    extracted = {"total": 50.0, "nit_o_identificacion": None, "proveedor": "Acme"}
    hints = {"total": 999.0, "nit_o_identificacion": "8001", "numero_factura": "A1"}
    merged = merge_hints_into_extraction(extracted, hints)
    assert merged["total"] == 50.0
    assert merged["nit_o_identificacion"] == "8001"
    assert merged["numero_factura"] == "A1"


def test_extract_invoice_en_ingles_y_oc():
    texto = """
    ACME TRAVEL LLC
    Invoice No. INV-8891
    Tax ID 900888777
    Purchase order OC44521
    Total $ 2,500.00
    """
    hints = extract_invoice_hints(texto)
    assert "8891" in hints.get("numero_factura", "")
    assert hints.get("compra")
    assert hints.get("total") == 2500.0


def test_us_total_fourteen_thousand_three_hundred():
    """14,300.00 (US) debe ser 14300, nunca 143000."""
    from domain.services.invoice_heuristics import _parse_money, merge_hints_into_extraction
    from infrastructure.persistence.repositories import _to_float

    assert _parse_money("14,300.00") == 14300.0
    assert _parse_money("14.300,00") == 14300.0
    assert _parse_money("14.300") == 14300.0
    assert _to_float(14300.0) == 14300.0
    assert _to_float("14,300.00") == 14300.0
    assert _to_float("14300.0") == 14300.0

    merged = merge_hints_into_extraction({"total": 143000.0}, {"total": 14300.0})
    assert merged["total"] == 14300.0


def test_no_toma_turno_como_numero_factura():
    texto = """
    FLYPASS S.A.S.
    NIT 900.123.456-7
    Turno: 15
    Factura electrónica FPFL-18121030
    Fecha 02/08/2026
    TOTAL A PAGAR $ 21.200
    COM007244
    """
    hints = extract_invoice_hints(texto)
    assert hints["numero_factura"].upper().replace(" ", "") in (
        "FPFL-18121030",
        "FPFL18121030",
    )
    assert "18121030" in hints["numero_factura"]
    assert hints["numero_factura"] not in ("15", "TURNO", "TURNO15")


def test_merge_reemplaza_turno_de_la_ia():
    ocr = """
    Turno No. 42
    Factura de venta No. FE-88991
    TOTAL $ 50.000
    """
    hints = extract_invoice_hints(ocr)
    merged = merge_hints_into_extraction(
        {"numero_factura": "42", "total": 50000},
        hints,
        ocr_text=ocr,
    )
    assert "88991" in str(merged["numero_factura"])
    assert str(merged["numero_factura"]) != "42"


def test_fpfl_gana_sobre_numero_corto():
    texto = "Caja 3  Turno 7  FPFL-991122  Total $ 10.000"
    hints = extract_invoice_hints(texto)
    assert "991122" in hints.get("numero_factura", "")
