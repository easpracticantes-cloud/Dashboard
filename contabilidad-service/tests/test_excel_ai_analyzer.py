"""Tests del analizador IA de Excel Autobits."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from infrastructure.ai.excel_ai_analyzer import ExcelAIAnalyzer, ExcelAIAnalysis


def test_excel_ai_analyzer_parses_ollama_mapping():
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

    fake_response = {
        "response": """{
          "mapping": {
            "proveedor": "Razón Social",
            "nit": "ID Tributaria",
            "numero_compra": "No Compra",
            "numero_reserva": null,
            "numero_documento": null,
            "valor": "Monto",
            "fecha": "Fecha Doc",
            "concepto": null
          },
          "period_start": "2026-08-16",
          "period_end": "2026-08-22",
          "notes": "Columnas no estándar interpretadas por contexto"
        }"""
    }

    with patch.object(analyzer, "available", return_value=True), patch(
        "infrastructure.ai.excel_ai_analyzer.requests.post"
    ) as mock_post:
        mock_post.return_value = MagicMock(
            raise_for_status=MagicMock(),
            json=MagicMock(return_value=fake_response),
        )
        result = analyzer.analyze(columns, samples, total_rows=1, filename="demo.xlsx")

    assert isinstance(result, ExcelAIAnalysis)
    assert result.mode == "ia"
    assert result.mapping["proveedor"] == "Razón Social"
    assert result.mapping["nit"] == "ID Tributaria"
    assert result.mapping["valor"] == "Monto"
    assert result.period_start == "2026-08-16"


def test_excel_ai_analyzer_fallback_when_ollama_down():
    analyzer = ExcelAIAnalyzer()
    columns = ["Proveedor", "NIT", "Valor"]
    with patch.object(analyzer, "available", return_value=False):
        result = analyzer.analyze(columns, [], allow_fallback=True)
    assert result.mode == "heuristico"
    assert result.mapping["proveedor"] == "Proveedor"
