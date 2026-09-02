"""Tests confidence scorer + validacion matematica."""

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from domain.services.confidence_scorer import confidence_to_dict, score_invoice_extraction
from validador import validar_factura


def test_confidence_all_fields():
    datos = {
        "numero_factura": "123",
        "proveedor": "Test SAS",
        "nit_o_identificacion": "900",
        "fecha_emision": "01/01/2024",
        "subtotal": "100000",
        "impuesto": "19000",
        "total": "119000",
        "moneda": "COP",
        "_metodo_ocr": "TESSERACT",
    }
    result = score_invoice_extraction(datos, ocr_chars=500)
    assert result.global_score >= 75
    assert result.requiere_revision is False
    assert result.fields_detail["total"].fuente == "OCR+IA"
    payload = confidence_to_dict(result)
    assert "fields_detail" in payload
    assert payload["fields_detail"]["proveedor"]["valor"] == "Test SAS"


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


def test_confidence_math_mismatch_lowers_score():
    datos = {
        "numero_factura": "123",
        "proveedor": "Test",
        "nit_o_identificacion": "900",
        "fecha_emision": "01/01/2024",
        "subtotal": "100000",
        "impuesto": "19000",
        "total": "500000",
        "moneda": "COP",
    }
    result = score_invoice_extraction(datos, ocr_chars=400)
    assert result.requiere_revision is True
    assert result.global_score <= 68


def test_validar_factura_math():
    datos, estado, _ = validar_factura(
        {
            "tipo_documento": "factura",
            "numero_factura": "FE-1",
            "proveedor": "ACME",
            "fecha_emision": "2026-01-01",
            "subtotal": 100000,
            "impuesto": 19000,
            "total": 500000,
        }
    )
    assert estado == "revisar"
    assert datos["requiere_revision"] is True
