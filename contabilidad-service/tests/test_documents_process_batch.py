"""Reproceso de facturas ya cargadas: POST /api/documents/process-batch."""

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

    class _FakeProc:
        def verify_dependencies(self):
            return []

        def process_by_id(self, *args, **kwargs):
            return {"ok": True}

    # El OCR real corre en background; aquí solo se valida el encolado y los estados.
    monkeypatch.setattr("api.routers.documents._process_document_ids_in_packs", lambda *a, **k: None)
    monkeypatch.setattr(
        "api.routers.documents.get_document_processing_service",
        lambda: _FakeProc(),
    )

    from api_server import app

    yield TestClient(app)
    _vaciar()


def _png_bytes(seed: int = 1) -> bytes:
    img = Image.new("RGB", (40, 40), color=(20 + seed, 80, 40))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _subir(client: TestClient, n: int) -> list[int]:
    files = [("archivos", (f"factura{i}.png", _png_bytes(i), "image/png")) for i in range(n)]
    res = client.post(
        "/api/documents/upload-batch",
        files=files,
        data={"auto_procesar": "false", "pack_size": "25", "tipo": "FACTURA"},
    )
    assert res.status_code == 200, res.text
    return res.json()["queued_ids"]


def _set_estado(doc_id: int, estado: str) -> None:
    from infrastructure.persistence.database import SessionLocal
    from infrastructure.persistence.models import DocumentModel

    db = SessionLocal()
    try:
        doc = db.get(DocumentModel, doc_id)
        doc.estado = estado
        db.commit()
    finally:
        db.close()


def _estado(doc_id: int) -> str:
    from infrastructure.persistence.database import SessionLocal
    from infrastructure.persistence.models import DocumentModel

    db = SessionLocal()
    try:
        return db.get(DocumentModel, doc_id).estado
    finally:
        db.close()


def test_process_batch_reprocesa_factura_con_error(client):
    """Caso A: una factura en ERROR vuelve al análisis y queda PROCESANDO."""
    ids = _subir(client, 1)
    _set_estado(ids[0], "ERROR")

    res = client.post("/api/documents/process-batch", json={"document_ids": ids, "pack_size": 25})

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ok"] is True
    assert body["queued"] == 1
    assert body["document_ids"] == ids
    assert _estado(ids[0]) == "PROCESANDO"


def test_process_batch_marca_procesando_documentos_ya_extraidos(client):
    """Una factura leída pero sin datos útiles también debe pasar por PROCESANDO."""
    ids = _subir(client, 2)
    for doc_id in ids:
        _set_estado(doc_id, "EXTRAIDO")

    res = client.post("/api/documents/process-batch", json={"document_ids": ids, "pack_size": 25})

    assert res.status_code == 200, res.text
    assert res.json()["queued"] == 2
    assert [_estado(i) for i in ids] == ["PROCESANDO", "PROCESANDO"]


def test_process_batch_sin_ids_responde_400(client):
    """Caso C: el frontend no debe poder encolar una lista vacía."""
    res = client.post("/api/documents/process-batch", json={"document_ids": [], "pack_size": 25})
    assert res.status_code == 400


def test_process_batch_no_reprocesa_facturas_pagadas(client):
    """No se toca lo ya pagado: el estado se conserva y el endpoint lo informa."""
    ids = _subir(client, 1)
    _set_estado(ids[0], "PAGADO")

    res = client.post("/api/documents/process-batch", json={"document_ids": ids, "pack_size": 25})

    assert res.status_code == 404
    assert "cerradas" in res.json()["detail"].lower()
    assert _estado(ids[0]) == "PAGADO"


def test_process_batch_ignora_ids_inexistentes_y_encola_los_validos(client):
    """Caso D parcial: IDs basura no rompen el reproceso de los buenos."""
    ids = _subir(client, 1)

    res = client.post(
        "/api/documents/process-batch",
        json={"document_ids": ids + [999999], "pack_size": 25},
    )

    assert res.status_code == 200, res.text
    assert res.json()["document_ids"] == ids
