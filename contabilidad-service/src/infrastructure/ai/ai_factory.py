"""Selecciona el proveedor de IA (Gemini en nube u Ollama local)."""

from __future__ import annotations

import logging

from config.settings import get_settings
from infrastructure.ai.gemini_client import GeminiClient
from infrastructure.ai.gemini_provider import GeminiAIProvider
from infrastructure.ai.ollama_provider import AIProvider, OllamaAIProvider

logger = logging.getLogger(__name__)


def resolve_ai_provider_name() -> str:
    """
    auto → Gemini si hay GEMINI_API_KEY, si no Ollama.
    gemini | ollama → fuerza ese proveedor.
    """
    settings = get_settings()
    raw = (settings.ai_provider or "auto").strip().lower()
    if raw in {"gemini", "google", "google-gemini"}:
        return "gemini"
    if raw in {"ollama", "local"}:
        return "ollama"
    # auto
    if (settings.gemini_api_key or "").strip():
        return "gemini"
    return "ollama"


def create_ai_provider() -> AIProvider:
    name = resolve_ai_provider_name()
    if name == "gemini":
        client = GeminiClient()
        if not client.configured():
            logger.warning(
                "AI_PROVIDER=gemini pero falta GEMINI_API_KEY; se usará Ollama como respaldo."
            )
            return OllamaAIProvider()
        logger.info("Proveedor IA Contabilidad: Gemini (%s)", client.model)
        return GeminiAIProvider(client)
    logger.info("Proveedor IA Contabilidad: Ollama")
    return OllamaAIProvider()


def ai_unavailable_message() -> str:
    name = resolve_ai_provider_name()
    if name == "gemini":
        return (
            "Gemini no responde. Revisa GEMINI_API_KEY y GEMINI_MODEL "
            "en el Environment del servicio Contabilidad en Render."
        )
    return "Ollama no responde en http://localhost:11434."
