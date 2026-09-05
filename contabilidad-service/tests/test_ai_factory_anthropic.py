"""Smoke: resolución de proveedor Anthropic / Claude."""

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from infrastructure.ai import ai_factory


def test_resolve_always_anthropic(monkeypatch):
    class S:
        ai_provider = "anthropic"
        anthropic_api_key = ""
        ollama_api_key = ""

    monkeypatch.setattr(ai_factory, "get_settings", lambda: S())
    assert ai_factory.resolve_ai_provider_name() == "anthropic"


def test_resolve_claude_alias_is_anthropic():
    assert ai_factory.resolve_ai_provider_name() == "anthropic"
