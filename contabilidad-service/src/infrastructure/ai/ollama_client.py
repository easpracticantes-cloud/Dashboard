"""Cliente Ollama unificado: local (localhost) o cloud (ollama.com).

Ollama Cloud documenta POST /api/chat (no /api/generate).
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import requests

from infrastructure.ai.ollama_config import (
    ollama_base_url,
    ollama_headers,
    ollama_model,
    ollama_tags_url,
    ollama_timeout,
)

logger = logging.getLogger(__name__)


def ollama_chat_url() -> str:
    return f"{ollama_base_url()}/api/chat"


def verificar_ollama() -> bool:
    try:
        respuesta = requests.get(
            ollama_tags_url(),
            headers=ollama_headers(),
            timeout=min(ollama_timeout(), 15),
        )
        respuesta.raise_for_status()
        return True
    except Exception as error:
        logger.warning("Ollama no responde (%s): %s", ollama_base_url(), error)
        return False


def _extract_json(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    if not text:
        return {}
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return {}
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return {}


def chat(
    prompt: str,
    *,
    json_mode: bool = False,
    system: str | None = None,
) -> str:
    """
    Llama a /api/chat (compatible local y https://ollama.com).
    Devuelve el texto del assistant.
    """
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload: dict[str, Any] = {
        "model": ollama_model(),
        "messages": messages,
        "stream": False,
    }
    if json_mode:
        payload["format"] = "json"

    url = ollama_chat_url()
    respuesta = requests.post(
        url,
        json=payload,
        headers=ollama_headers(),
        timeout=max(ollama_timeout(), 90),
    )
    if respuesta.status_code == 404:
        body = (respuesta.text or "")[:300]
        raise RuntimeError(
            f"Ollama 404 en {url}. En cloud usa /api/chat y un modelo de "
            f"https://ollama.com (ej. gpt-oss:120b), no solo llama3.2 local. "
            f"Detalle: {body}"
        )
    respuesta.raise_for_status()
    data = respuesta.json()
    message = data.get("message") or {}
    text = (message.get("content") or data.get("response") or "").strip()
    if not text:
        raise RuntimeError("Ollama devolvió respuesta vacía.")
    return text


def chat_json(prompt: str, *, system: str | None = None) -> dict[str, Any]:
    text = chat(prompt, json_mode=True, system=system)
    data = _extract_json(text)
    if not data:
        raise RuntimeError("Ollama no devolvió JSON válido.")
    return data
