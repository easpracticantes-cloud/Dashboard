"""Configuracion centralizada del Sistema Contable IA."""

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


PROYECTO_RAIZ = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Variables de entorno y valores por defecto."""

    model_config = SettingsConfigDict(
        env_file=str(PROYECTO_RAIZ / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_name: str = "Sistema Contable IA"
    database_url: str = f"sqlite:///{(PROYECTO_RAIZ / 'data' / 'contable.db').as_posix()}"

    # Acepta AI_PROVIDER (Contabilidad) y APP_AI_PROVIDER (mismo nombre que el backend SIG)
    ai_provider: str = Field(
        default="gemini",
        validation_alias=AliasChoices("AI_PROVIDER", "APP_AI_PROVIDER", "ai_provider"),
    )

    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"
    ollama_timeout: int = 90
    ollama_api_key: str = ""

    gemini_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("GEMINI_API_KEY", "gemini_api_key"),
    )
    gemini_model: str = Field(
        default="gemini-2.0-flash",
        validation_alias=AliasChoices("GEMINI_MODEL", "gemini_model"),
    )
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_timeout: int = 90
    # Lista separada por comas — se prueban si el modelo principal falla
    gemini_fallback_models: str = (
        "gemini-2.0-flash,gemini-1.5-flash,gemini-1.5-flash-latest,gemini-flash-latest"
    )

    # Si OCR < umbral, Gemini visión analiza la imagen (evita "0 caracteres")
    gemini_vision_on_weak_ocr: bool = True

    # Anthropic Claude (A4)
    anthropic_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("ANTHROPIC_API_KEY", "anthropic_api_key"),
    )
    anthropic_base_url: str = Field(
        default="https://api.anthropic.com",
        validation_alias=AliasChoices("ANTHROPIC_BASE_URL", "anthropic_base_url"),
    )
    anthropic_api_version: str = "2023-06-01"
    anthropic_max_tokens: int = Field(
        default=4096,
        validation_alias=AliasChoices("ANTHROPIC_MAX_TOKENS", "AI_MAX_TOKENS"),
    )
    anthropic_timeout: int = Field(
        default=90,
        validation_alias=AliasChoices("ANTHROPIC_TIMEOUT", "AI_TIMEOUT"),
    )
    anthropic_max_retries: int = Field(
        default=2,
        validation_alias=AliasChoices("ANTHROPIC_MAX_RETRIES", "AI_MAX_RETRIES"),
    )
    ai_model_fast: str = Field(
        default="claude-haiku-4-5-20251001",
        validation_alias=AliasChoices("AI_MODEL_FAST", "ai_model_fast"),
    )
    ai_model_reasoning: str = Field(
        default="claude-sonnet-4-5-20250929",
        validation_alias=AliasChoices("AI_MODEL_REASONING", "ai_model_reasoning"),
    )
    ai_price_haiku_input: float = Field(default=1.0, validation_alias=AliasChoices("AI_PRICE_HAIKU_INPUT"))
    ai_price_haiku_output: float = Field(default=5.0, validation_alias=AliasChoices("AI_PRICE_HAIKU_OUTPUT"))
    ai_price_sonnet_input: float = Field(default=3.0, validation_alias=AliasChoices("AI_PRICE_SONNET_INPUT"))
    ai_price_sonnet_output: float = Field(default=15.0, validation_alias=AliasChoices("AI_PRICE_SONNET_OUTPUT"))

    # A7: procesamiento en background (FastAPI BackgroundTasks) cuando el router lo solicite
    process_async_default: bool = Field(
        default=False,
        validation_alias=AliasChoices("PROCESS_ASYNC_DEFAULT", "AI_PROCESS_ASYNC"),
    )

    tesseract_lang: str = "spa+eng"
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
