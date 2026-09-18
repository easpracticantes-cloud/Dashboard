"""Tests del analizador IA de Excel Autobits."""

import sys
from pathlib import Path
from unittest.mock import patch

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from domain.autobits.fields import AUTOBITS_EXPORT_COLUMNS
from infrastructure.ai.excel_ai_analyzer import ExcelAIAnalyzer, ExcelAIAnalysis


def test_excel_ai_analyzer_parses_ai_mapping():
    analyzer = ExcelAIAnalyzer()
    columns = ["Razón Social", "ID Tributaria", "No Compra", "Monto", "Fecha Doc"]
    samples = [
        {
            "Razón Social": "Hotel Demo",
            "ID Tributaria": "900111",
            "No Compra": "C-1",
            "Monto": 100000,
            "Fecha Doc": "2026-08-20",
        }
    ]

    fake_json = {
        "mapping": {
            "proveedor": "Razón Social",
            "nit": "ID Tributaria",
            "numero_compra": "No Compra",
            "numero_reserva": None,
            "numero_documento": None,
            "valor": "Monto",
            "fecha": "Fecha Doc",
            "concepto": None,
        },
        "period_start": "2026-08-16",
        "period_end": "2026-08-22",
        "notes": "Columnas no estándar interpretadas por contexto",
    }

    with patch.object(analyzer, "available", return_value=True), patch.object(
        analyzer.client, "generate_json", return_value=fake_json
    ):
        result = analyzer.analyze(columns, samples, total_rows=1, filename="demo.xlsx")

    assert isinstance(result, ExcelAIAnalysis)
    assert result.mode == "ia"
    assert result.mapping["proveedor"] == "Razón Social"
    assert result.mapping["nit"] == "ID Tributaria"
    assert result.mapping["valor"] == "Monto"
    assert result.period_start == "2026-08-16"


def test_excel_ai_analyzer_fallback_when_ia_down():
    analyzer = ExcelAIAnalyzer()
    columns = ["Proveedor", "NIT", "Valor"]
    with patch.object(analyzer, "available", return_value=False):
        result = analyzer.analyze(columns, [], allow_fallback=True)
    assert result.mode == "heuristico"
    assert result.mapping["proveedor"] == "Proveedor"


def test_excel_ai_skips_ia_on_real_autobits_export():
    analyzer = ExcelAIAnalyzer()
    columns = list(AUTOBITS_EXPORT_COLUMNS)
    samples = [
        {
            "Codigo Orden de compra": "COM007441",
            "Codigo Factura proveedor": "FE-6920",
            "Fecha de ejecución (Reserva)": "2026-08-20",
            "Total": 84000,
        }
    ]
    with patch.object(analyzer, "available", return_value=True), patch.object(
        analyzer.client, "generate_json"
    ) as mock_ai:
        result = analyzer.analyze(columns, samples, total_rows=12, filename="autobits.xlsx")
    mock_ai.assert_not_called()
    assert result.mode == "canonico"
    assert result.mapping["numero_compra"] == "Codigo Orden de compra"
    assert result.mapping["numero_documento"] == "Codigo Factura proveedor"
    assert result.mapping["numero_reserva"] == "Codigo Reserva"
    assert result.period_start == "2026-08-20"
