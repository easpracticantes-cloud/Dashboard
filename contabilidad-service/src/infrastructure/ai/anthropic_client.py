"""Cliente Anthropic Messages API (Claude Haiku / Sonnet)."""

from __future__ import annotations

import base64
import json
import logging
import mimetypes
from pathlib import Path
from typing import Any

import httpx

from config.settings import get_settings

logger = logging.getLogger(__name__)


class AnthropicClientError(Exception):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


class AnthropicClient:
    def __init__(self) -> None:
        s = get_settings()
        self.api_key = (s.anthropic_api_key or "").strip()
        self.workspace_id = (getattr(s, "anthropic_workspace_id", None) or "").strip()
        self.base_url = (s.anthropic_base_url or "https://api.anthropic.com").rstrip("/")
        self.api_version = s.anthropic_api_version or "2023-06-01"
        self.model_fast = s.ai_model_fast or "claude-haiku-4-5-20251001"
        self.model_reasoning = s.ai_model_reasoning or "claude-sonnet-4-5-20250929"
        self.max_tokens = int(s.anthropic_max_tokens or 4096)
        self.timeout = float(s.anthropic_timeout or 90)
        self.max_retries = int(s.anthropic_max_retries or 2)
        self.price_fast_in = float(s.ai_price_haiku_input or 1.0)
        self.price_fast_out = float(s.ai_price_haiku_output or 5.0)
        self.price_reason_in = float(s.ai_price_sonnet_input or 3.0)
        self.price_reason_out = float(s.ai_price_sonnet_output or 15.0)

    def configured(self) -> bool:
        return bool(self.api_key)

    def model_for(self, tier: str) -> str:
        return self.model_reasoning if tier == "REASONING" else self.model_fast

    def estimate_cost_usd(self, tier: str, input_tokens: int, output_tokens: int) -> float:
        if tier == "REASONING":
            return (input_tokens / 1_000_000) * self.price_reason_in + (
                output_tokens / 1_000_000
            ) * self.price_reason_out
        return (input_tokens / 1_000_000) * self.price_fast_in + (
            output_tokens / 1_000_000
        ) * self.price_fast_out

    def generate_text(
        self,
        system: str,
        user: str,
        *,
        json_mode: bool = False,
        tier: str = "FAST",
    ) -> tuple[str, dict[str, Any]]:
        model = self.model_for(tier)
        sys = system or ""
        if json_mode:
            sys += "\n\nResponde ÚNICAMENTE con JSON válido. Sin markdown ni texto fuera del JSON."
        body: dict[str, Any] = {
            "model": model,
            "max_tokens": self.max_tokens,
            "system": sys,
            "messages": [{"role": "user", "content": user}],
            "temperature": 0.1 if json_mode else 0.3,
        }
        return self._post(body, tier=tier, model=model)

    def generate_from_image(
        self,
        image_path: Path,
        prompt: str,
        *,
        json_mode: bool = True,
        tier: str = "FAST",
    ) -> tuple[str, dict[str, Any]]:
        data = Path(image_path).read_bytes()
        mime, _ = mimetypes.guess_type(str(image_path))
        if not mime or not mime.startswith("image/"):
            mime = "image/jpeg"
        b64 = base64.standard_b64encode(data).decode("ascii")
        model = self.model_for(tier)
        system = ""
        if json_mode:
            system = "Responde ÚNICAMENTE con JSON válido. Sin markdown."
        body: dict[str, Any] = {
            "model": model,
            "max_tokens": self.max_tokens,
            "system": system,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": mime,
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
            "temperature": 0.1,
        }
        return self._post(body, tier=tier, model=model)

    def generate_json(self, prompt: str, *, tier: str = "FAST") -> dict[str, Any]:
        text, meta = self.generate_text(
            "Eres un extractor contable. Solo JSON.",
            prompt,
            json_mode=True,
            tier=tier,
        )
        data = _parse_json(text)
        data["_ai_meta"] = meta
        return data

    def generate_json_from_image(self, image_path: Path, prompt: str, *, tier: str = "FAST") -> dict[str, Any]:
        text, meta = self.generate_from_image(image_path, prompt, json_mode=True, tier=tier)
        data = _parse_json(text)
        data["_ai_meta"] = meta
        return data

    def _post(self, body: dict[str, Any], *, tier: str, model: str) -> tuple[str, dict[str, Any]]:
        if not self.configured():
            raise AnthropicClientError("ANTHROPIC_API_KEY no configurada")

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": self.api_version,
            "content-type": "application/json",
        }
        if self.workspace_id:
            headers["anthropic-workspace-id"] = self.workspace_id
        url = f"{self.base_url}/v1/messages"
        last_err: Exception | None = None
        for attempt in range(1, max(1, self.max_retries) + 1):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    resp = client.post(url, headers=headers, json=body)
                if resp.status_code >= 400:
                    if resp.status_code in {429, 500, 502, 503} and attempt < self.max_retries:
                        last_err = AnthropicClientError(resp.text[:300], resp.status_code)
                        continue
                    raise AnthropicClientError(
                        f"HTTP {resp.status_code}: {resp.text[:300]}", resp.status_code
                    )
                payload = resp.json()
                text = _extract_text(payload)
                usage = payload.get("usage") or {}
                in_tok = int(usage.get("input_tokens") or 0)
                out_tok = int(usage.get("output_tokens") or 0)
                cost = self.estimate_cost_usd(tier, in_tok, out_tok)
                meta = {
                    "provider": "anthropic",
                    "model": model,
                    "tier": tier,
                    "input_tokens": in_tok,
                    "output_tokens": out_tok,
                    "estimated_cost_usd": round(cost, 8),
                }
                logger.info(
                    "[Anthropic] OK model=%s tier=%s in=%s out=%s cost≈%s",
                    model,
                    tier,
                    in_tok,
                    out_tok,
                    meta["estimated_cost_usd"],
                )
                return text, meta
            except AnthropicClientError:
                raise
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                logger.warning("[Anthropic] attempt %s failed: %s", attempt, exc)
        raise AnthropicClientError(str(last_err) if last_err else "Anthropic falló")


def _extract_text(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    for block in payload.get("content") or []:
        if isinstance(block, dict) and block.get("type") == "text":
            t = block.get("text") or ""
            if t:
                parts.append(t)
    return "\n".join(parts).strip()


def _parse_json(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    data = json.loads(text)
    if not isinstance(data, dict):
        raise AnthropicClientError("JSON no es objeto")
    return data
