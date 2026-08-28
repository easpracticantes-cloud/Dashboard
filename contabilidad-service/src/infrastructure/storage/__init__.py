"""Factory de proveedores de almacenamiento."""

from config.settings import get_settings
from infrastructure.storage.google_drive_provider import GoogleDriveStorageProvider
from infrastructure.storage.local_storage_provider import LocalStorageProvider

settings = get_settings()


def get_storage_provider():
    if settings.storage_provider == "google_drive" and settings.google_drive_enabled:
        return GoogleDriveStorageProvider()
    return LocalStorageProvider()


def storage_status() -> dict:
    local = LocalStorageProvider().info()
    drive = GoogleDriveStorageProvider().info()
    active = settings.storage_provider
    return {
        "active_provider": active,
        "local": local,
        "google_drive": drive,
    }
