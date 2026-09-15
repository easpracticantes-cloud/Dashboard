"""Carga batch con ZIP de facturas."""

from __future__ import annotations

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


def _vaciar():
    from sqlalchemy import text

    from infrastructure.persistence.database import engine

    with engine.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys = OFF"))
        for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")):
            if not row[0].startswith("sqlite_"):
                conn.execute(text(f'DELETE FROM "{row[0]}"'))


def _png_bytes(color=(10, 20, 30)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (24, 24), color=color).save(buf, format="PNG")
    return buf.getvalue()


def _zip_of_pngs(n: int) -> bytes:
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for i in range(n):
            zf.writestr(f"semana/f{i}.png", _png_bytes((i * 7 % 255, 40, 80)))
    return buf.getvalue()


@pytest.fixture
def client(monkeypatch):
    get_settings.cache_clear()
    init_db()
    _vaciar()

    class _FakeProc:
        def verify_dependencies(self):
            return []

        def process_by_id(self, *args, **kwargs):
            return None

    monkeypatch.setattr(
        "api.routers.documents.get_document_processing_service",
        lambda: _FakeProc(),
    )
    from api_server import app

    return TestClient(app)


def test_upload_batch_zip_expands(client: TestClient):
    raw = _zip_of_pngs(3)
    res = client.post(
        "/api/documents/upload-batch",
        files=[("archivos", ("lote.zip", raw, "application/zip"))],
        data={
            "tipo": "FACTURA",
            "origen": "CARGA_MANUAL",
            "auto_procesar": "false",
            "pack_size": "25",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total_recibidos"] == 3
    assert len(body["queued_ids"]) == 3


def test_upload_batch_zip_over_25_allowed(client: TestClient):
    raw = _zip_of_pngs(30)
    res = client.post(
        "/api/documents/upload-batch",
        files=[("archivos", ("grande.zip", raw, "application/zip"))],
        data={
            "tipo": "FACTURA",
            "origen": "CARGA_MANUAL",
            "auto_procesar": "false",
            "pack_size": "25",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total_recibidos"] == 30
    assert len(body["queued_ids"]) == 30


def test_upload_batch_single_png(client: TestClient):
    res = client.post(
        "/api/documents/upload-batch",
        files=[("archivos", ("una.png", _png_bytes(), "image/png"))],
        data={
            "tipo": "FACTURA",
            "origen": "CARGA_MANUAL",
            "auto_procesar": "false",
            "pack_size": "25",
        },
    )
    assert res.status_code == 200, res.text
    assert len(res.json()["queued_ids"]) == 1
