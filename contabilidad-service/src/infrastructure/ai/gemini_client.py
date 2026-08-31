"""Cliente REST mínimo para Google Gemini (sin SDK)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import requests

from config.settings import get_settings

logger = logging.getLogger(__name__)


class GeminiClientError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


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


class GeminiClient:
    """Llama a generateContent con API key (igual que el backend SIG)."""

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = (settings.gemini_api_key or "").strip()
        self.model = (settings.gemini_model or "gemini-2.0-flash").strip()
        self.base_url = (settings.gemini_base_url or "").rstrip("/")
        self.timeout = max(int(settings.gemini_timeout or 90), 30)

    def configured(self) -> bool:
        return bool(self.api_key)

    def verify(self) -> bool:
        if not self.configured():
            return False
        try:
            # List models es liviano y confirma key + red
            url = f"{self.base_url}/models?key={self.api_key}&pageSize=1"
            response = requests.get(url, timeout=min(self.timeout, 15))
            if response.status_code == 200:
                return True
            logger.warning("Gemini verify HTTP %s: %s", response.status_code, response.text[:200])
            return False
        except Exception as exc:
            logger.warning("Gemini verify falló: %s", exc)
            return False

    def generate_text(self, prompt: str, *, json_mode: bool = False) -> str:
        if not self.configured():
            raise GeminiClientError("GEMINI_API_KEY no configurada.")

        url = f"{self.base_url}/models/{self.model}:generateContent?key={self.api_key}"
        body: dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.2,
            },
        }
        if json_mode:
            body["generationConfig"]["responseMimeType"] = "application/json"

        try:
            response = requests.post(url, json=body, timeout=self.timeout)
            response.raise_for_status()
        except requests.HTTPError as exc:
            detail = ""
            try:
                detail = response.text[:400]
            except Exception:
                pass
            raise GeminiClientError(f"Gemini HTTP {response.status_code}: {detail or exc}") from exc
        except Exception as exc:
            raise GeminiClientError(f"Error llamando a Gemini: {exc}") from exc

        data = response.json()
        candidates = data.get("candidates") or []
        if not candidates:
            raise GeminiClientError("Gemini no devolvió candidatos.")
        parts = (((candidates[0] or {}).get("content") or {}).get("parts")) or []
        text = "".join(str(p.get("text") or "") for p in parts).strip()
        if not text:
            raise GeminiClientError("Gemini devolvió respuesta vacía.")
        return text

    def generate_json(self, prompt: str) -> dict[str, Any]:
        text = self.generate_text(prompt, json_mode=True)
        data = _extract_json(text)
        if not data:
            raise GeminiClientError("Gemini no devolvió JSON válido.")
        return data
