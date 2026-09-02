"""Smoke: resolución de proveedor Anthropic / Gemini."""

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from infrastructure.ai import ai_factory


def test_resolve_anthropic_aliases(monkeypatch):
    class S:
        ai_provider = "claude"
        anthropic_api_key = "sk-test"
        gemini_api_key = ""
        ollama_api_key = ""

    monkeypatch.setattr(ai_factory, "get_settings", lambda: S())
    assert ai_factory.resolve_ai_provider_name() == "anthropic"


def test_resolve_auto_prefers_anthropic(monkeypatch):
    class S:
        ai_provider = "auto"
        anthropic_api_key = "sk-test"
        gemini_api_key = "g"
        ollama_api_key = ""

    monkeypatch.setattr(ai_factory, "get_settings", lambda: S())
    assert ai_factory.resolve_ai_provider_name() == "anthropic"
