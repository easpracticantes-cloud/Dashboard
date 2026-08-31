"""Configuración compartida de Ollama (local o cloud ollama.com)."""

from __future__ import annotations

from config.settings import get_settings


def ollama_base_url() -> str:
    return (get_settings().ollama_url or "http://localhost:11434").rstrip("/")


def ollama_api_key() -> str:
    return (get_settings().ollama_api_key or "").strip()


def ollama_model() -> str:
    return (get_settings().ollama_model or "llama3.2").strip()


def ollama_timeout() -> int:
    return max(int(get_settings().ollama_timeout or 90), 25)


def ollama_generate_url() -> str:
    return f"{ollama_base_url()}/api/generate"


def ollama_tags_url() -> str:
    return f"{ollama_base_url()}/api/tags"


def ollama_headers() -> dict[str, str]:
    key = ollama_api_key()
    if not key:
        return {}
    return {"Authorization": f"Bearer {key}"}
