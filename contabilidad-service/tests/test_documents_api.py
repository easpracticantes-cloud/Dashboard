"""Tests upload y listado de documentos."""

import io
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from config.settings import get_settings
from infrastructure.persistence.database import init_db


def _make_test_image() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (100, 100), color=(255, 255, 255)).save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def client():
    get_settings.cache_clear()
    init_db()
    from api_server import app

    return TestClient(app)


def test_upload_and_list_document(client):
    img = _make_test_image()
    response = client.post(
        "/api/documents/upload",
        files={"archivo": ("test-factura.jpg", img, "image/jpeg")},
        data={"tipo": "FACTURA", "origen": "CARGA_MANUAL", "auto_procesar": "false"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["document"]["filename"] == "test-factura.jpg"
    assert data["document"]["estado"] in ("RECIBIDO", "DUPLICADO")

    list_resp = client.get("/api/documents")
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] >= 1


def test_upload_rejects_invalid_extension(client):
    response = client.post(
        "/api/documents/upload",
        files={"archivo": ("virus.exe", b"bad", "application/octet-stream")},
        data={"tipo": "FACTURA"},
    )
    assert response.status_code == 400
