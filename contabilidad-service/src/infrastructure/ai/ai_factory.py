"""Selecciona el proveedor de IA (solo Claude / Anthropic)."""

from __future__ import annotations

import logging

from config.settings import get_settings
from infrastructure.ai.ollama_provider import AIProvider

logger = logging.getLogger(__name__)


def ai_unavailable_message() -> str:
    return (
        "Claude/Anthropic no responde. Revisa ANTHROPIC_API_KEY, "
        "ANTHROPIC_WORKSPACE_ID y AI_MODEL_FAST."
    )


def resolve_ai_provider_name() -> str:
    return "anthropic"


def create_ai_provider() -> AIProvider:
    from infrastructure.ai.anthropic_client import AnthropicClient
    from infrastructure.ai.anthropic_provider import AnthropicAIProvider

    client = AnthropicClient()
    if not client.configured():
        logger.error(
            "Falta ANTHROPIC_API_KEY. Configura ANTHROPIC_API_KEY y ANTHROPIC_WORKSPACE_ID."
        )
    else:
        logger.info(
            "Proveedor IA Contabilidad: Anthropic (fast=%s reasoning=%s)",
            client.model_fast,
            client.model_reasoning,
        )
    return AnthropicAIProvider(client)
