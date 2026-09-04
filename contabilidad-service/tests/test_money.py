"""Tests de aritmética monetaria en Decimal (Fase 4.3)."""

import sys
from decimal import Decimal
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from domain.matching.normalize import value_difference, values_close as matching_values_close
from domain.utils.money import format_cop, money_sum, money_to_float, to_money, values_close
from validador import validar_factura


def test_to_money_formatos_colombianos():
    assert to_money("1.234.567,89") == Decimal("1234567.89")
    assert to_money("$ 1,234,567.89") == Decimal("1234567.89")
    assert to_money("1.500") == Decimal("1500.00")
    assert to_money("850000.0") == Decimal("850000.00")
    assert to_money("12,50") == Decimal("12.50")
    assert to_money("(1.500)") == Decimal("-1500.00")


def test_to_money_valores_vacios_o_ilegibles():
    assert to_money(None) == Decimal("0.00")
    assert to_money("") == Decimal("0.00")
    assert to_money("sin valor") == Decimal("0.00")
    assert to_money(float("nan")) == Decimal("0.00")


def test_to_money_redondea_half_up_a_dos_decimales():
    assert to_money(Decimal("10.005")) == Decimal("10.01")
    assert to_money(Decimal("10.004")) == Decimal("10.00")
    assert to_money(Decimal("-10.005")) == Decimal("-10.01")
    assert to_money(2.675) == Decimal("2.68")


def test_money_sum_no_arrastra_error_binario():
    assert money_sum([0.1] * 10) == Decimal("1.00")
    assert float(money_sum([0.1] * 10)) == 1.0
    assert money_sum([None, "", 1000, "2.000"]) == Decimal("3000.00")


def test_money_to_float_conserva_none():
    assert money_to_float(None) is None
    assert money_to_float("1.234.567,89") == 1234567.89


def test_values_close_usa_tolerancia_relativa_y_absoluta():
    assert values_close(1_000_000, 1_000_000.40) is True
    assert values_close(1000, 1200) is False
    assert values_close(100, 100.5, rel=0, abs_tol=1) is True
    assert values_close(100, 102, rel=0, abs_tol=1) is False
    assert values_close(None, 5) is False


def test_matching_values_close_mantiene_semantica_porcentual():
    assert matching_values_close(850000.0, 850000.0) is True
    assert matching_values_close(850000.0, 854000.0) is True  # 0.47% ≤ 1%
    assert matching_values_close(850000.0, 870000.0) is False  # 2.3% > 1%
    assert matching_values_close(850000.0, 870000.0, tolerance_pct=5.0) is True


def test_value_difference_es_exacta():
    assert value_difference(0.3, 0.1) == Decimal("0.20")
    assert value_difference(None, 100) is None


def test_format_cop():
    assert format_cop(1234567.89) == "$1.234.568"
    assert format_cop(0) == "$0"
    assert format_cop(-1500) == "-$1.500"


def test_validar_factura_iva_consistente_en_formato_colombiano():
    datos, estado, _ = validar_factura(
        {
            "tipo_documento": "factura",
            "numero_factura": "FE-100",
            "proveedor": "Hotel Salento SAS",
            "fecha_emision": "2026-02-10",
            "subtotal": "1.000.000",
            "impuesto": "190.000",
            "total": "1.190.000",
        }
    )
    assert estado == "procesado"
    assert datos["requiere_revision"] is False


def test_validar_factura_detecta_iva_inconsistente():
    datos, estado, observaciones = validar_factura(
        {
            "tipo_documento": "factura",
            "numero_factura": "FE-101",
            "proveedor": "Hotel Salento SAS",
            "fecha_emision": "2026-02-10",
            "subtotal": "1.000.000",
            "impuesto": "190.000",
            "total": "2.000.000",
        }
    )
    assert estado == "revisar"
    assert datos["requiere_revision"] is True
    assert "Inconsistencia matematica" in observaciones


def test_validar_factura_tolera_diferencia_de_un_peso():
    _, estado, _ = validar_factura(
        {
            "tipo_documento": "factura",
            "numero_factura": "FE-102",
            "proveedor": "Hotel Salento SAS",
            "fecha_emision": "2026-02-10",
            "subtotal": 100000,
            "impuesto": 19000,
            "total": 119001,
        }
    )
    assert estado == "procesado"
