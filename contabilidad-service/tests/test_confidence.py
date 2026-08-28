"""Tests confidence scorer."""

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from domain.services.confidence_scorer import score_invoice_extraction


def test_confidence_all_fields():
    datos = {
        "numero_factura": "123",
        "proveedor": "Test SAS",
        "nit_o_identificacion": "900",
        "fecha_emision": "01/01/2024",
        "subtotal": "100",
        "impuesto": "19",
        "total": "119",
        "moneda": "COP",
    }
    result = score_invoice_extraction(datos, ocr_chars=500)
    assert result.global_score >= 75
    assert result.requiere_revision is False


def test_confidence_missing_total():
    datos = {
        "numero_factura": "123",
        "proveedor": "Test",
        "fecha_emision": "01/01/2024",
        "total": None,
    }
    result = score_invoice_extraction(datos, ocr_chars=100)
    assert result.fields["total"] == 0
    assert result.requiere_revision is True
