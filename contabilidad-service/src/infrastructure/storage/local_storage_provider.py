"""Proveedor de almacenamiento local — /YYYY/MM/TIPO/."""

from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path

from config.settings import get_settings
from domain.enums import StorageFolderType

settings = get_settings()


class LocalStorageProvider:
    """Guarda archivos en storage/YYYY/MM/TIPO/."""

    def __init__(self, root: Path | None = None):
        self.root = root or settings.storage_root

    def resolve_dir(self, folder_type: str, when: datetime | None = None) -> Path:
        now = when or datetime.now()
        tipo = folder_type.upper()
        if tipo not in StorageFolderType:
            tipo = StorageFolderType.OTRO
        path = self.root / str(now.year) / f"{now.month:02d}" / tipo
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save(
        self,
        content: bytes,
        filename: str,
        folder_type: str,
        *,
        when: datetime | None = None,
        unique: bool = True,
    ) -> str:
        dest_dir = self.resolve_dir(folder_type, when)
        safe_name = Path(filename).name
        if unique:
            safe_name = f"{uuid.uuid4().hex[:8]}_{safe_name}"
        dest_path = dest_dir / safe_name
        dest_path.write_bytes(content)
        return str(dest_path)

    def get(self, path: str) -> bytes:
        file_path = Path(path)
        if not file_path.exists() or not file_path.is_file():
            raise FileNotFoundError(f"Archivo no encontrado: {path}")
        return file_path.read_bytes()

    def exists(self, path: str) -> bool:
        p = Path(path)
        return p.exists() and p.is_file()

    def info(self) -> dict:
        return {
            "provider": "local",
            "root": str(self.root),
            "structure": "YYYY/MM/TIPO",
            "folder_types": list(StorageFolderType),
        }
