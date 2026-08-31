"""Análisis de Excel Autobits con IA (Gemini u Ollama)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from config.settings import get_settings
from domain.autobits.fields import AUTOBITS_FIELDS, suggest_mapping
from infrastructure.ai.ai_factory import resolve_ai_provider_name
from infrastructure.ai.gemini_client import GeminiClient, GeminiClientError
from ia_ollama import URL_OLLAMA, verificar_ollama

import requests


@dataclass
class ExcelAIAnalysis:
    """Resultado del análisis inteligente del Excel."""

    mapping: dict[str, str | None]
    period_start: str | None = None
    period_end: str | None = None
    sheet_notes: str = ""
    mode: str = "ia"  # ia | heuristico
    raw_ai: dict[str, Any] = field(default_factory=dict)


class ExcelAIAnalyzerError(Exception):
    def __init__(self, message: str, code: str = "AI_EXCEL_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code


def _serialize_for_prompt(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (int, float, bool, str)):
        return value
    return str(value)


def _extract_json(text: str) -> dict:
    text = (text or "").strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return {}
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return {}


class ExcelAIAnalyzer:
    """Usa Gemini u Ollama para entender cualquier estructura de Excel Autobits."""

    def __init__(self):
        settings = get_settings()
        self.model = settings.ollama_model
        self.timeout = max(settings.ollama_timeout, 90)
        self.url = URL_OLLAMA
        self.provider_name = resolve_ai_provider_name()

    def available(self) -> bool:
        if self.provider_name == "gemini":
            return GeminiClient().verify()
        return verificar_ollama()

    def analyze(
        self,
        columns: list[str],
        sample_rows: list[dict],
        *,
        total_rows: int = 0,
        filename: str = "",
        allow_fallback: bool = True,
    ) -> ExcelAIAnalysis:
        """
        Pide a la IA que deduzca el mapeo de columnas y el período
        según el Excel concreto (sin reglas fijas de alias).
        """
        if not columns:
            raise ExcelAIAnalyzerError("El Excel no tiene encabezados.", "EMPTY_SHEET")

        if self.available():
            try:
                return self._analyze_with_ai(columns, sample_rows, total_rows, filename)
            except ExcelAIAnalyzerError:
                if not allow_fallback:
                    raise
            except Exception:
                if not allow_fallback:
                    raise

        if not allow_fallback:
            raise ExcelAIAnalyzerError(
                "La IA no está disponible para analizar el Excel. "
                "Configure GEMINI_API_KEY (Render) o inicie Ollama (local).",
                "AI_UNAVAILABLE",
            )

        mapping = suggest_mapping(columns)
        return ExcelAIAnalysis(
            mapping=mapping,
            sheet_notes="Análisis heurístico (IA no disponible).",
            mode="heuristico",
        )

    def _build_prompt(
        self,
        columns: list[str],
        sample_rows: list[dict],
        total_rows: int,
        filename: str,
    ) -> str:
        sample_clean = [
            {str(k): _serialize_for_prompt(v) for k, v in row.items()}
            for row in sample_rows[:8]
        ]

        return f"""
Eres un asistente contable. Analizas un reporte Excel exportado desde Autobits (Colombia).
Debes ENTENDER la hoja aunque el orden o nombres varíen ligeramente.
Deduce el significado por encabezados y valores de ejemplo.

Formato típico real de Autobits (referencia):
- "NIT/CC Proveedor (Orden de Compra)" → nit
- "Nombre Proveedor (Orden de Compra)" → proveedor
- "Codigo Orden de compra" → numero_compra
- "Codigo Reserva" → numero_reserva
- "Fecha de ejecución (Reserva)" → fecha
- "Nombre concepto" → concepto
- "Total" → valor
- "OBSERVACIONES" → observaciones (notas: pendiente, efectivo, etc.)
- "estado de la compra" → estado_compra
Columnas que normalmente se IGNORAN (null): "Moneda", "SI", "NO"
(No hay columna de número de factura en este export; numero_documento puede ser null.)

Archivo: {filename or "reporte.xlsx"}
Total de filas de datos: {total_rows}
Columnas detectadas:
{json.dumps(columns, ensure_ascii=False)}

Muestra de filas (JSON):
{json.dumps(sample_clean, ensure_ascii=False, indent=2)}

Campos internos que el sistema necesita (mapea cada uno a UNA columna del Excel, o null si no existe):
- proveedor
- nit
- numero_compra
- numero_reserva
- numero_documento
- valor
- fecha
- concepto
- observaciones
- estado_compra

También estima el período del reporte (fechas mín/máx visibles) en formato YYYY-MM-DD.

Responde SOLO con JSON válido, sin markdown ni explicaciones:
{{
  "mapping": {{
    "proveedor": "nombre exacto de columna o null",
    "nit": null,
    "numero_compra": null,
    "numero_reserva": null,
    "fecha": null,
    "concepto": null,
    "valor": null,
    "numero_documento": null,
    "observaciones": null,
    "estado_compra": null
  }},
  "period_start": "YYYY-MM-DD o null",
  "period_end": "YYYY-MM-DD o null",
  "notes": "breve explicación de cómo interpretaste el Excel"
}}

Reglas:
- Los valores de mapping deben ser nombres EXACTOS de la lista de columnas, o null.
- No inventes columnas.
- No mapees SI, NO ni Moneda a campos internos.
- SÍ mapea OBSERVACIONES → observaciones y estado de la compra → estado_compra.
- Prioriza Total → valor, Nombre Proveedor → proveedor, NIT/CC → nit.
"""

    def _analyze_with_ai(
        self,
        columns: list[str],
        sample_rows: list[dict],
        total_rows: int,
        filename: str,
    ) -> ExcelAIAnalysis:
        prompt = self._build_prompt(columns, sample_rows, total_rows, filename)

        if self.provider_name == "gemini":
            try:
                data = GeminiClient().generate_json(prompt)
            except GeminiClientError as exc:
                raise ExcelAIAnalyzerError(
                    f"Error al consultar Gemini para el Excel: {exc.message}",
                    "GEMINI_ERROR",
                ) from exc
        else:
            payload = {
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.1},
            }
            try:
                response = requests.post(self.url, json=payload, timeout=self.timeout)
                response.raise_for_status()
                content = response.json().get("response", "")
            except Exception as exc:
                raise ExcelAIAnalyzerError(
                    f"Error al consultar Ollama para el Excel: {exc}",
                    "OLLAMA_ERROR",
                ) from exc
            data = _extract_json(content)

        if not data:
            raise ExcelAIAnalyzerError(
                "La IA no devolvió un análisis JSON válido del Excel.",
                "INVALID_AI_JSON",
            )

        raw_mapping = data.get("mapping") or {}
        mapping: dict[str, str | None] = {field: None for field in AUTOBITS_FIELDS}
        col_set = set(columns)

        for field in AUTOBITS_FIELDS:
            value = raw_mapping.get(field)
            if value is None or value == "" or str(value).lower() == "null":
                mapping[field] = None
                continue
            value_str = str(value).strip()
            if value_str in col_set:
                mapping[field] = value_str
            else:
                match = next((c for c in columns if c.lower() == value_str.lower()), None)
                mapping[field] = match

        if not any(mapping.values()):
            raise ExcelAIAnalyzerError(
                "La IA no pudo relacionar ninguna columna del Excel con campos contables.",
                "NO_MAPPING",
            )

        return ExcelAIAnalysis(
            mapping=mapping,
            period_start=_clean_date(data.get("period_start")),
            period_end=_clean_date(data.get("period_end")),
            sheet_notes=str(data.get("notes") or "Analizado por IA"),
            mode="ia",
            raw_ai=data,
        )


def _clean_date(value: Any) -> str | None:
    if value is None or value == "" or str(value).lower() == "null":
        return None
    text = str(value).strip()[:10]
    if re.match(r"^\d{4}-\d{2}-\d{2}$", text):
        return text
    return None
