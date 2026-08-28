"""Adapter IA — envuelve Ollama existente."""

from dataclasses import dataclass
from typing import Any, Protocol

from ia_ollama import analizar_factura_con_ollama, verificar_ollama
from ia_ollama_custom import analizar_con_solicitud


@dataclass
class AIExtractionResult:
    ok: bool
    data: dict[str, Any]
    raw_text: str | None = None
    error: str = ""


class AIProvider(Protocol):
    def verify(self) -> bool: ...
    def extract_invoice(self, ocr_text: str) -> AIExtractionResult: ...
    def extract_custom(self, ocr_text: str, solicitud: str) -> AIExtractionResult: ...


class OllamaAIProvider:
    """Implementacion sobre ia_ollama.py e ia_ollama_custom.py."""

    def verify(self) -> bool:
        return verificar_ollama()

    def extract_invoice(self, ocr_text: str) -> AIExtractionResult:
        datos = analizar_factura_con_ollama(ocr_text)
        if not datos:
            return AIExtractionResult(ok=False, data={}, error="No se obtuvo JSON desde Ollama")
        return AIExtractionResult(ok=True, data=datos)

    def extract_custom(self, ocr_text: str, solicitud: str) -> AIExtractionResult:
        resultado = analizar_con_solicitud(ocr_text, solicitud)
        if not resultado.get("ok"):
            return AIExtractionResult(
                ok=False,
                data={},
                error=resultado.get("error", "Error en Ollama"),
            )
        return AIExtractionResult(
            ok=True,
            data={"respuesta_ia": resultado.get("respuesta", "")},
            raw_text=resultado.get("respuesta"),
        )
