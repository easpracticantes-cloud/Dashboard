"""Funciones simples para analizar facturas con Ollama (local o cloud)."""

import json

from infrastructure.ai.ollama_config import (
    ollama_generate_url,
    ollama_headers,
    ollama_model,
    ollama_tags_url,
    ollama_timeout,
)

# Compat exports (otros módulos pueden importar estos nombres)
MODELO_OLLAMA = "llama3.2"
URL_OLLAMA = "http://localhost:11434/api/generate"
URL_OLLAMA_TAGS = "http://localhost:11434/api/tags"
TIMEOUT_OLLAMA = 25


def verificar_ollama():
    """Revisa si Ollama (local o https://ollama.com) responde."""
    try:
        import requests

        respuesta = requests.get(
            ollama_tags_url(),
            headers=ollama_headers(),
            timeout=min(ollama_timeout(), 15),
        )
        respuesta.raise_for_status()
        return True
    except Exception as error:
        print("ERROR: Ollama no responde.")
        print(f"Detalle: {error}")
        print("Local: abre Ollama. Cloud: define OLLAMA_URL=https://ollama.com y OLLAMA_API_KEY.")
        return False


def analizar_factura_con_ollama(texto_ocr):
    """Envia el texto OCR a Ollama y espera un JSON con datos de factura."""
    try:
        import requests

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

        datos = {
            "model": ollama_model(),
            "prompt": prompt,
            "stream": False,
            "format": "json",
        }

        respuesta = requests.post(
            ollama_generate_url(),
            json=datos,
            headers=ollama_headers(),
            timeout=ollama_timeout(),
        )
        respuesta.raise_for_status()

        contenido = respuesta.json()
        texto_respuesta = contenido.get("response", "").strip()

        return json.loads(texto_respuesta)
    except json.JSONDecodeError:
        print("ERROR en JSON: Ollama no devolvio JSON valido.")
        return {}
    except Exception as error:
        print(f"ERROR en Ollama: {error}")
        return {}
