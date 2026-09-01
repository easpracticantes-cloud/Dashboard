"""Cliente REST Gemini con fallbacks de modelo y visión (OCR débil)."""

from __future__ import annotations

import base64
import json
import logging
import mimetypes
import re
from pathlib import Path
from typing import Any

import requests

from config.settings import get_settings

logger = logging.getLogger(__name__)

# Modelos a probar si el principal falla (404/403 de modelo). Orden: más recientes primero.
DEFAULT_FALLBACKS = (
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-flash-latest",
)


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


def _mime_for(path: Path) -> str:
    guessed, _ = mimetypes.guess_type(str(path))
    if guessed and guessed.startswith("image/"):
        return guessed
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    return "image/jpeg"


class GeminiClient:
    """Llama a generateContent; reintenta con modelos alternos si el principal falla."""

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = (settings.gemini_api_key or "").strip()
        self.primary_model = (settings.gemini_model or "gemini-2.0-flash").strip()
        self.base_url = (settings.gemini_base_url or "").rstrip("/")
        self.timeout = max(int(settings.gemini_timeout or 90), 30)
        raw_fb = (getattr(settings, "gemini_fallback_models", None) or "").strip()
        extras = [m.strip() for m in raw_fb.split(",") if m.strip()] if raw_fb else list(DEFAULT_FALLBACKS)
        seen: set[str] = set()
        models: list[str] = []
        for m in [self.primary_model, *extras]:
            if m and m not in seen:
                seen.add(m)
                models.append(m)
        self.models = models
        self.model = self.primary_model

    def configured(self) -> bool:
        return bool(self.api_key)

    def verify(self) -> bool:
        if not self.configured():
            return False
        try:
            # Probar un generate mínimo con el primer modelo viable
            self.generate_text("Responde solo: OK", json_mode=False)
            return True
        except Exception as exc:
            logger.warning("Gemini verify falló: %s", exc)
            # List models como respaldo (algunas keys listan pero no generan)
            try:
                url = f"{self.base_url}/models?key={self.api_key}&pageSize=1"
                response = requests.get(url, timeout=min(self.timeout, 15))
                return response.status_code == 200
            except Exception:
                return False

    def _post(self, model: str, body: dict[str, Any]) -> requests.Response:
        url = f"{self.base_url}/models/{model}:generateContent?key={self.api_key}"
        return requests.post(url, json=body, timeout=self.timeout)

    def _text_from_response(self, data: dict[str, Any]) -> str:
        candidates = data.get("candidates") or []
        if not candidates:
            raise GeminiClientError("Gemini no devolvió candidatos.")
        parts = (((candidates[0] or {}).get("content") or {}).get("parts")) or []
        text = "".join(str(p.get("text") or "") for p in parts).strip()
        if not text:
            raise GeminiClientError("Gemini devolvió respuesta vacía.")
        return text

    def _generation_config(self, json_mode: bool) -> dict[str, Any]:
        cfg: dict[str, Any] = {
            "temperature": 0.2,
            "maxOutputTokens": 4096,
        }
        cfg["responseMimeType"] = "application/json" if json_mode else "text/plain"
        return cfg

    def _call_with_fallbacks(self, body: dict[str, Any]) -> str:
        if not self.configured():
            raise GeminiClientError(
                "GEMINI_API_KEY no configurada en Contabilidad. "
                "Copia la misma key del backend SIG (dashboard-7spt)."
            )

        last_error = ""
        for model in self.models:
            try:
                logger.info("Gemini Contabilidad POST model=%s", model)
                response = self._post(model, body)
                if response.status_code in (404, 403):
                    last_error = f"HTTP {response.status_code} model={model}: {response.text[:300]}"
                    logger.warning("Gemini modelo no usable, probando siguiente: %s", last_error)
                    continue
                response.raise_for_status()
                self.model = model
                return self._text_from_response(response.json())
            except GeminiClientError:
                raise
            except requests.HTTPError as exc:
                detail = ""
                try:
                    detail = response.text[:400]
                except Exception:
                    pass
                last_error = f"HTTP {response.status_code}: {detail or exc}"
                if response.status_code in (429, 500, 502, 503):
                    logger.warning("Gemini temporal %s — reintento con otro modelo", response.status_code)
                    continue
                raise GeminiClientError(
                    f"Gemini HTTP {response.status_code} (modelo={model}). "
                    f"Usa la misma GEMINI_API_KEY y GEMINI_MODEL que el backend. Detalle: {detail or exc}"
                ) from exc
            except Exception as exc:
                last_error = str(exc)
                logger.warning("Gemini error con %s: %s", model, exc)
                continue

        raise GeminiClientError(
            "Ningún modelo Gemini respondió. "
            f"Probados: {', '.join(self.models)}. Último error: {last_error}"
        )

    def generate_text(self, prompt: str, *, json_mode: bool = False) -> str:
        body: dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": self._generation_config(json_mode),
        }
        return self._call_with_fallbacks(body)

    def generate_from_image(
        self,
        image_path: Path,
        prompt: str,
        *,
        json_mode: bool = False,
    ) -> str:
        """Envía la imagen a Gemini (visión) cuando Tesseract no saca texto."""
        path = Path(image_path)
        if not path.exists():
            raise GeminiClientError(f"Imagen no encontrada: {path}")
        raw = path.read_bytes()
        if len(raw) < 32:
            raise GeminiClientError("Archivo de imagen vacío o corrupto.")
        b64 = base64.b64encode(raw).decode("ascii")
        body: dict[str, Any] = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": prompt},
                        {"inline_data": {"mime_type": _mime_for(path), "data": b64}},
                    ],
                }
            ],
            "generationConfig": self._generation_config(json_mode),
        }
        return self._call_with_fallbacks(body)

    def generate_json(self, prompt: str) -> dict[str, Any]:
        text = self.generate_text(prompt, json_mode=True)
        data = _extract_json(text)
        if not data:
            raise GeminiClientError("Gemini no devolvió JSON válido.")
        return data

    def generate_json_from_image(self, image_path: Path, prompt: str) -> dict[str, Any]:
        text = self.generate_from_image(image_path, prompt, json_mode=True)
        data = _extract_json(text)
        if not data:
            raise GeminiClientError("Gemini visión no devolvió JSON válido.")
        return data
