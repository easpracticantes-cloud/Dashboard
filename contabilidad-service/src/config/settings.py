"""Configuracion centralizada del Sistema Contable IA."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROYECTO_RAIZ = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Variables de entorno y valores por defecto."""

    model_config = SettingsConfigDict(
        env_file=str(PROYECTO_RAIZ / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Sistema Contable IA"
    database_url: str = f"sqlite:///{(PROYECTO_RAIZ / 'data' / 'contable.db').as_posix()}"
    # auto | gemini | ollama — en Render usar gemini (o auto + GEMINI_API_KEY)
    ai_provider: str = "auto"
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"
    ollama_timeout: int = 90
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_timeout: int = 90
    tesseract_cmd: str | None = None
    storage_provider: str = "local"
    storage_root: Path = PROYECTO_RAIZ / "storage"
    autobits_provider: str = "excel"
    google_drive_enabled: bool = False
    log_level: str = "INFO"
    max_upload_mb: int = 20
    min_caracteres_ocr: int = 100
    api_host: str = "127.0.0.1"
    api_port: int = 8787


@lru_cache
def get_settings() -> Settings:
    """Singleton de configuracion."""
    return Settings()
