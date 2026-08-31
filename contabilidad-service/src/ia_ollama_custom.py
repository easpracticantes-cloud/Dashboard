"""Analisis con Ollama usando solicitudes personalizadas del usuario."""

from infrastructure.ai.ollama_client import chat


def analizar_con_solicitud(texto_ocr, solicitud_usuario):
    """Envia texto OCR y la solicitud del usuario a Ollama (local o cloud)."""
    try:
        solicitud = (solicitud_usuario or "").strip()
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
        texto_respuesta = chat(prompt)
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
