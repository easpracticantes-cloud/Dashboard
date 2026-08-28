"""Tests Google Drive stub."""

import sys
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from infrastructure.storage.google_drive_provider import GoogleDriveStorageProvider, NOT_CONFIGURED_MSG


def test_google_drive_not_configured():
    provider = GoogleDriveStorageProvider()
    info = provider.info()
    assert info["configured"] is False
    assert NOT_CONFIGURED_MSG in info["message"]

    with pytest.raises(NotImplementedError, match=NOT_CONFIGURED_MSG):
        provider.save(b"data", "file.txt", "FACTURA")
