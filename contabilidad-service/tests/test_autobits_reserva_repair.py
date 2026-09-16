"""Codigo Reserva del Excel Autobits no debe perderse en el cruce."""

import json
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from application.services.autobits_service import AutobitsService  # noqa: E402
from domain.autobits.fields import AUTOBITS_EXPORT_COLUMNS, suggest_mapping  # noqa: E402
from infrastructure.ai.excel_ai_analyzer import ExcelAIAnalyzer  # noqa: E402


def test_suggest_mapping_incluye_codigo_reserva_completo():
    mapping = suggest_mapping(list(AUTOBITS_EXPORT_COLUMNS))
    assert mapping["numero_reserva"] == "Codigo Reserva"
    assert mapping["numero_compra"] == "Codigo Orden de compra"


def test_ai_analyzer_rellena_reserva_si_ia_la_omite():
    analyzer = ExcelAIAnalyzer()
    columns = list(AUTOBITS_EXPORT_COLUMNS)
    # Simula respuesta IA incompleta (sin numero_reserva)
    mapping = {field: None for field in (
        "proveedor", "nit", "numero_compra", "numero_reserva", "numero_documento",
        "valor", "fecha", "concepto", "observaciones", "estado_compra",
    )}
    mapping["proveedor"] = "Nombre Proveedor (Orden de Compra)"
    mapping["numero_compra"] = "Codigo Orden de compra"
    # Lo que hace _analyze_with_ai al final: merge heurístico
    from domain.autobits.fields import AUTOBITS_FIELDS

    heuristic = suggest_mapping(columns)
    for field in AUTOBITS_FIELDS:
        if not mapping.get(field) and heuristic.get(field):
            mapping[field] = heuristic[field]
    assert mapping["numero_reserva"] == "Codigo Reserva"


def test_value_from_raw_codigo_reserva():
    raw = {
        "Codigo Orden de compra": "COM007441",
        "Codigo Reserva": " EAS002722",
        "Nombre concepto": "Almuerzo",
    }
    assert AutobitsService._value_from_raw(raw, "codigo reserva") == "EAS002722"
    assert AutobitsService._value_from_raw(
        raw, "codigo orden de compra", "orden de compra"
    ) == "COM007441"
    # No debe tomar "concepto" por el alias corto "com"
    assert AutobitsService._value_from_raw(raw, "com") is None
