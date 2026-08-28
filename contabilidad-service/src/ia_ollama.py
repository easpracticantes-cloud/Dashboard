"""Funciones simples para analizar facturas con Ollama local."""

import json


# Cambia este valor si quieres usar otro modelo instalado en Ollama.
MODELO_OLLAMA = "llama3.2"

# Endpoint local de Ollama para generar respuestas.
URL_OLLAMA = "http://localhost:11434/api/generate"
URL_OLLAMA_TAGS = "http://localhost:11434/api/tags"

# Tiempo maximo de espera por cada respuesta de Ollama.
TIMEOUT_OLLAMA = 25


def verificar_ollama():
    """Revisa si Ollama local responde antes de iniciar el lote."""
    try:
        import requests

        respuesta = requests.get(URL_OLLAMA_TAGS, timeout=5)
        respuesta.raise_for_status()
        return True
    except Exception as error:
        print("ERROR: Ollama no esta respondiendo en http://localhost:11434.")
        print(f"Detalle: {error}")
        print("Abre Ollama y confirma que el modelo este instalado.")
        return False


def analizar_factura_con_ollama(texto_ocr):
    """Envia el texto OCR a Ollama y espera un JSON con datos de factura."""
    try:
        # Importamos requests aqui para controlar el error si falta instalarlo.
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
            "model": MODELO_OLLAMA,
            "prompt": prompt,
            "stream": False,
            "format": "json",
        }

        respuesta = requests.post(URL_OLLAMA, json=datos, timeout=TIMEOUT_OLLAMA)
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
