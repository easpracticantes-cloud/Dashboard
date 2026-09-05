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
