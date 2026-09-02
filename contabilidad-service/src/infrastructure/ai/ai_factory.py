"""Selecciona el proveedor de IA (Anthropic / Gemini / Ollama)."""

from __future__ import annotations

import logging

from config.settings import get_settings
from infrastructure.ai.gemini_client import GeminiClient
from infrastructure.ai.gemini_provider import GeminiAIProvider
from infrastructure.ai.ollama_provider import AIProvider, OllamaAIProvider

logger = logging.getLogger(__name__)


def ai_unavailable_message() -> str:
    name = resolve_ai_provider_name()
    if name == "anthropic":
        return (
            "Anthropic no responde. Revisa ANTHROPIC_API_KEY y AI_MODEL_FAST "
            "en el Environment del servicio Contabilidad en Render."
        )
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
    anthropic|claude | gemini | ollama → fuerza ese proveedor.
    auto → Anthropic si hay key; si no Gemini; si no Ollama.
    """
    settings = get_settings()
    raw = (settings.ai_provider or "gemini").strip().lower()
    if raw in {"anthropic", "claude"}:
        return "anthropic"
    if raw in {"gemini", "google", "google-gemini"}:
        return "gemini"
    if raw in {"ollama", "local"}:
        return "ollama"
    # auto
    if (settings.anthropic_api_key or "").strip():
        return "anthropic"
    if (settings.gemini_api_key or "").strip():
        return "gemini"
    if (settings.ollama_api_key or "").strip():
        return "ollama"
    return "gemini"


def create_ai_provider() -> AIProvider:
    settings = get_settings()
    raw = (settings.ai_provider or "gemini").strip().lower()
    name = resolve_ai_provider_name()

    if name == "anthropic":
        from infrastructure.ai.anthropic_client import AnthropicClient
        from infrastructure.ai.anthropic_provider import AnthropicAIProvider

        client = AnthropicClient()
        if not client.configured():
            if raw in {"auto", "automatic"}:
                logger.warning(
                    "AI_PROVIDER=auto sin ANTHROPIC_API_KEY; intentando Gemini."
                )
                return _create_gemini_or_ollama(raw)
            logger.error(
                "AI_PROVIDER=anthropic pero falta ANTHROPIC_API_KEY. "
                "Configura la key en Contabilidad (Render)."
            )
            return AnthropicAIProvider(client)
        logger.info(
            "Proveedor IA Contabilidad: Anthropic (fast=%s reasoning=%s)",
            client.model_fast,
            client.model_reasoning,
        )
        return AnthropicAIProvider(client)

    if name == "gemini":
        return _create_gemini_or_ollama(raw)

    from infrastructure.ai.ollama_config import ollama_base_url, ollama_model

    logger.info(
        "Proveedor IA Contabilidad: Ollama (%s @ %s)",
        ollama_model(),
        ollama_base_url(),
    )
    return OllamaAIProvider()


def _create_gemini_or_ollama(raw: str) -> AIProvider:
    client = GeminiClient()
    if not client.configured():
        if raw in {"auto", "automatic"}:
            logger.warning(
                "AI_PROVIDER=auto sin GEMINI_API_KEY; se usará Ollama como respaldo."
            )
            return OllamaAIProvider()
        logger.error(
            "AI_PROVIDER=gemini pero falta GEMINI_API_KEY. "
            "Configura la key en Contabilidad (Render) o usa AI_PROVIDER=auto."
        )
        return GeminiAIProvider(client)
    logger.info("Proveedor IA Contabilidad: Gemini (%s)", client.model)
    return GeminiAIProvider(client)
