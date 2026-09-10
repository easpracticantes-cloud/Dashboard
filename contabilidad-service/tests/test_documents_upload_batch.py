"""Carga masiva de documentos en paquetes."""

import io
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from config.settings import get_settings  # noqa: E402
from infrastructure.persistence.database import init_db  # noqa: E402


def _vaciar():
    from infrastructure.persistence.database import engine
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys = OFF"))
        for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")):
            if not row[0].startswith("sqlite_"):
                conn.execute(text(f'DELETE FROM "{row[0]}"'))


@pytest.fixture
def client(monkeypatch):
    get_settings.cache_clear()
    init_db()
    _vaciar()

    # Evita OCR/IA reales en el background task
    def _noop(*args, **kwargs):
        return None

    class _FakeProc:
        def verify_dependencies(self):
            return []

        def process_by_id(self, *args, **kwargs):
            return {"ok": True}

        def ask_about_documents(self, pregunta, documents):
            if not documents:
                return {"ok": False, "error": "No hay facturas para consultar. Súbelas primero."}
            return {"ok": True, "respuesta": "ok", "documentos": len(documents)}

    monkeypatch.setattr(
        "api.routers.documents._process_document_ids_in_packs",
        _noop,
    )
    monkeypatch.setattr(
        "api.routers.documents.get_document_processing_service",
        lambda: _FakeProc(),
    )

    from api_server import app

    yield TestClient(app)
    _vaciar()


def _png_bytes(name_seed: int = 1) -> bytes:
    img = Image.new("RGB", (40, 40), color=(20 + name_seed, 80, 40))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_upload_batch_queues_packs(client):
    files = [
        ("archivos", (f"f{i}.png", _png_bytes(i), "image/png"))
        for i in range(3)
    ]
    res = client.post(
        "/api/documents/upload-batch",
        files=files,
        data={"auto_procesar": "true", "pack_size": "25", "tipo": "FACTURA"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total_recibidos"] == 3
    assert body["packs"] == 1
    assert len(body["queued_ids"]) == 3
    assert "paquete" in body["mensaje"].lower() or "cola" in body["mensaje"].lower()


def test_upload_batch_rechaza_mas_de_25(client):
    files = [
        ("archivos", (f"f{i}.png", _png_bytes(i), "image/png"))
        for i in range(26)
    ]
    res = client.post(
        "/api/documents/upload-batch",
        files=files,
        data={"auto_procesar": "false", "tipo": "FACTURA"},
    )
    assert res.status_code == 400
    assert "25" in (res.json().get("detail") or "")


def test_ask_sin_pregunta(client):
    res = client.post("/api/documents/ask", json={"pregunta": "   "})
    assert res.status_code == 400


def test_ask_sin_facturas(client):
    res = client.post("/api/documents/ask", json={"pregunta": "Resume los totales"})
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is False
    assert "factura" in (body.get("error") or "").lower()
