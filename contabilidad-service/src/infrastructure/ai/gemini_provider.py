"""Adapter IA — Google Gemini (nube), compatible con OllamaAIProvider."""

from __future__ import annotations

from typing import Any

from infrastructure.ai.gemini_client import GeminiClient, GeminiClientError
from infrastructure.ai.ollama_provider import AIExtractionResult


INVOICE_JSON_PROMPT = """
Extrae datos de una factura a partir del siguiente texto OCR.

Responde SOLO con JSON valido. No agregues explicaciones.
No inventes datos. Si un campo no aparece claramente, usa null.
Si hay ambiguedad, requiere_revision debe ser true.
Si el documento no parece factura, requiere_revision debe ser true.
El total debe ser numerico si se puede identificar.
Si faltan campos importantes, agregalos en campos_faltantes.

Usa exactamente esta estructura:
{{
  "tipo_documento": "factura",
  "numero_factura": null,
  "proveedor": null,
  "nit_o_identificacion": null,
  "fecha_emision": null,
  "subtotal": null,
  "impuesto": null,
  "total": null,
  "moneda": null,
  "concepto_general": null,
  "campos_faltantes": [],
  "requiere_revision": false,
  "observaciones": null
}}

Texto OCR:
{ocr_text}
"""


class GeminiAIProvider:
    """Implementacion sobre la API REST de Gemini."""

    def __init__(self, client: GeminiClient | None = None) -> None:
        self.client = client or GeminiClient()

    def verify(self) -> bool:
        return self.client.verify()

    def extract_invoice(self, ocr_text: str) -> AIExtractionResult:
        try:
            datos = self.client.generate_json(INVOICE_JSON_PROMPT.format(ocr_text=ocr_text))
            if not datos:
                return AIExtractionResult(ok=False, data={}, error="No se obtuvo JSON desde Gemini")
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
