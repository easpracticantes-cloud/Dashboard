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
        from infrastructure.ai.invoice_schema import build_invoice_text_prompt

        return chat_json(build_invoice_text_prompt(texto_ocr))
    except Exception as error:
        print(f"ERROR en Ollama: {error}")
        return {}
