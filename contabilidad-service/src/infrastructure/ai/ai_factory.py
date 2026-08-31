"""Selecciona el proveedor de IA (Gemini en nube u Ollama local)."""

from __future__ import annotations

import logging

from config.settings import get_settings
from infrastructure.ai.gemini_client import GeminiClient
from infrastructure.ai.gemini_provider import GeminiAIProvider
from infrastructure.ai.ollama_provider import AIProvider, OllamaAIProvider

logger = logging.getLogger(__name__)


def ai_unavailable_message() -> str:
    name = resolve_ai_provider_name()
    if name == "gemini":
        return (
            "Gemini no responde. Revisa GEMINI_API_KEY y GEMINI_MODEL "
            "en el Environment del servicio Contabilidad en Render."
        )
    from infrastructure.ai.ollama_config import ollama_api_key, ollama_base_url

    if ollama_api_key() or "ollama.com" in ollama_base_url():
        return (
            "Ollama Cloud no responde. Revisa OLLAMA_URL=https://ollama.com, "
            "OLLAMA_API_KEY y OLLAMA_MODEL en Render."
        )
    return "Ollama no responde en http://localhost:11434."


def resolve_ai_provider_name() -> str:
    """
    gemini | ollama → fuerza ese proveedor.
    auto → Gemini si hay GEMINI_API_KEY; si no Ollama.
    """
    settings = get_settings()
    raw = (settings.ai_provider or "gemini").strip().lower()
    if raw in {"gemini", "google", "google-gemini"}:
        return "gemini"
    if raw in {"ollama", "local"}:
        return "ollama"
    if (settings.gemini_api_key or "").strip():
        return "gemini"
    if (settings.ollama_api_key or "").strip():
        return "ollama"
    return "gemini"


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
    from infrastructure.ai.ollama_config import ollama_base_url, ollama_model

    logger.info(
        "Proveedor IA Contabilidad: Ollama (%s @ %s)",
        ollama_model(),
        ollama_base_url(),
    )
    return OllamaAIProvider()

