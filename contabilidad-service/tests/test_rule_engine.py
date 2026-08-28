"""Tests del motor de reglas."""

from domain.rules.rule_engine import RuleEngine


def test_rule_engine_aprobado():
    engine = RuleEngine()
    datos = {
        "tipo_documento": "factura",
        "numero_factura": "123",
        "proveedor": "Test SAS",
        "fecha_emision": "01/01/2024",
        "total": "1000",
        "requiere_revision": False,
    }
    result = engine.evaluate_invoice(datos)
    assert result.estado == "procesado"
    assert result.passed is True


def test_rule_engine_revisar_falta_total():
    engine = RuleEngine()
    datos = {
        "tipo_documento": "factura",
        "numero_factura": "123",
        "proveedor": "Test SAS",
        "fecha_emision": "01/01/2024",
        "total": None,
    }
    result = engine.evaluate_invoice(datos)
    assert result.estado == "revisar"
    assert result.requiere_revision is True
    assert any("total" in c.lower() or "Falta" in c for c in result.observaciones + result.campos_faltantes)
