"""Stub Google Drive — integración no configurada."""

from config.settings import get_settings

settings = get_settings()
NOT_CONFIGURED_MSG = "Integración no configurada"


class GoogleDriveStorageProvider:
    """Placeholder para futura integración con Google Drive."""

    def __init__(self):
        self.enabled = settings.google_drive_enabled

    def save(self, content: bytes, filename: str, folder_type: str) -> str:
        raise NotImplementedError(NOT_CONFIGURED_MSG)

    def get(self, path: str) -> bytes:
        raise NotImplementedError(NOT_CONFIGURED_MSG)

    def info(self) -> dict:
        return {
            "provider": "google_drive",
            "enabled": self.enabled,
            "configured": False,
            "message": NOT_CONFIGURED_MSG if not self.enabled else "Credenciales no configuradas",
        }
