"""Analisis con Ollama usando solicitudes personalizadas del usuario."""

from infrastructure.ai.ollama_config import (
    ollama_generate_url,
    ollama_headers,
    ollama_model,
    ollama_timeout,
)


def analizar_con_solicitud(texto_ocr, solicitud_usuario):
    """Envia texto OCR y la solicitud del usuario a Ollama (local o cloud)."""
    try:
        import requests

        solicitud = solicitud_usuario.strip()
        if not solicitud:
            return {
                "ok": False,
                "respuesta": "",
                "error": "La solicitud no puede estar vacia.",
            }

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
{texto_ocr}
"""

        datos = {
            "model": ollama_model(),
            "prompt": prompt,
            "stream": False,
        }

        respuesta = requests.post(
            ollama_generate_url(),
            json=datos,
            headers=ollama_headers(),
            timeout=max(ollama_timeout(), 90),
        )
        respuesta.raise_for_status()

        contenido = respuesta.json()
        texto_respuesta = contenido.get("response", "").strip()

        if not texto_respuesta:
            return {
                "ok": False,
                "respuesta": "",
                "error": "Ollama devolvio una respuesta vacia.",
            }

        return {
            "ok": True,
            "respuesta": texto_respuesta,
            "error": "",
        }
    except Exception as error:
        return {
            "ok": False,
            "respuesta": "",
            "error": str(error),
        }
