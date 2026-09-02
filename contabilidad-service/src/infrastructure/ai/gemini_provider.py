"""Adapter IA — Google Gemini (texto + visión)."""

from __future__ import annotations

from pathlib import Path

from infrastructure.ai.gemini_client import GeminiClient, GeminiClientError
from infrastructure.ai.invoice_schema import INVOICE_VISION_PROMPT, build_invoice_text_prompt
from infrastructure.ai.ollama_provider import AIExtractionResult


class GeminiAIProvider:
    """Implementacion sobre la API REST de Gemini (texto y visión)."""

    def __init__(self, client: GeminiClient | None = None) -> None:
        self.client = client or GeminiClient()

    def verify(self) -> bool:
        # Solo exige key configurada; el generate real prueba modelos con fallback.
        return self.client.configured()

    def extract_invoice(self, ocr_text: str) -> AIExtractionResult:
        try:
            datos = self.client.generate_json(build_invoice_text_prompt(ocr_text))
            if not datos:
                return AIExtractionResult(ok=False, data={}, error="No se obtuvo JSON desde Gemini")
            return AIExtractionResult(ok=True, data=datos)
        except GeminiClientError as exc:
            return AIExtractionResult(ok=False, data={}, error=exc.message)
        except Exception as exc:
            return AIExtractionResult(ok=False, data={}, error=str(exc))

    def extract_invoice_from_image(self, image_path: Path) -> AIExtractionResult:
        try:
            datos = self.client.generate_json_from_image(Path(image_path), INVOICE_VISION_PROMPT)
            return AIExtractionResult(ok=True, data=datos)
        except GeminiClientError as exc:
            return AIExtractionResult(ok=False, data={}, error=exc.message)
        except Exception as exc:
            return AIExtractionResult(ok=False, data={}, error=str(exc))

    def extract_custom(self, ocr_text: str, solicitud: str) -> AIExtractionResult:
        solicitud = (solicitud or "").strip()
        if not solicitud:
            return AIExtractionResult(ok=False, data={}, error="La solicitud no puede estar vacia.")

        prompt = f"""
Analiza el siguiente texto extraido por OCR de un documento.

Solicitud del usuario:
{solicitud}

Reglas:
- Responde solo a lo que pidio el usuario.
- No inventes datos que no aparezcan en el texto OCR.
- Si un dato no es claro, dilo explicitamente.
- Responde en espanol.
- Se claro y estructurado.

Texto OCR:
{ocr_text}
"""
        try:
            texto = self.client.generate_text(prompt, json_mode=False)
            return AIExtractionResult(
                ok=True,
                data={"respuesta_ia": texto},
                raw_text=texto,
            )
        except GeminiClientError as exc:
            return AIExtractionResult(ok=False, data={}, error=exc.message)
        except Exception as exc:
            return AIExtractionResult(ok=False, data={}, error=str(exc))

    def extract_custom_from_image(self, image_path: Path, solicitud: str) -> AIExtractionResult:
        solicitud = (solicitud or "").strip()
        if not solicitud:
            return AIExtractionResult(ok=False, data={}, error="La solicitud no puede estar vacia.")

        prompt = f"""
Analiza la IMAGEN de este documento contable.

Solicitud del usuario:
{solicitud}

Reglas:
- Responde solo a lo que pidio el usuario.
- No inventes datos que no se vean en la imagen.
- Si un dato no es claro, dilo explicitamente.
- Responde en espanol.
- Se claro y estructurado.
"""
        try:
            texto = self.client.generate_from_image(Path(image_path), prompt, json_mode=False)
            return AIExtractionResult(
                ok=True,
                data={"respuesta_ia": texto},
                raw_text=texto,
            )
        except GeminiClientError as exc:
            return AIExtractionResult(ok=False, data={}, error=exc.message)
        except Exception as exc:
            return AIExtractionResult(ok=False, data={}, error=str(exc))
