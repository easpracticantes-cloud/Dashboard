"""Funciones simples para analizar facturas con Ollama (local o cloud)."""

from infrastructure.ai.ollama_client import chat, chat_json, verificar_ollama

# Compat: nombres históricos importados por otros módulos
MODELO_OLLAMA = "llama3.2"
URL_OLLAMA = "http://localhost:11434/api/chat"
URL_OLLAMA_TAGS = "http://localhost:11434/api/tags"
TIMEOUT_OLLAMA = 25

__all__ = [
    "MODELO_OLLAMA",
    "URL_OLLAMA",
    "URL_OLLAMA_TAGS",
    "TIMEOUT_OLLAMA",
    "verificar_ollama",
    "analizar_factura_con_ollama",
]


def analizar_factura_con_ollama(texto_ocr):
    """Envia el texto OCR a Ollama y espera un JSON con datos de factura."""
    try:
        prompt = f"""
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
{texto_ocr}
"""
        return chat_json(prompt)
    except Exception as error:
        print(f"ERROR en Ollama: {error}")
        return {}
