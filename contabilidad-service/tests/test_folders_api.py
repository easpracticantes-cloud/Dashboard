"""API de carpetas semanales de facturas."""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from config.settings import get_settings
from infrastructure.persistence.database import init_db


def test_create_and_list_folder():
    get_settings.cache_clear()
    init_db()
    from api_server import app

    client = TestClient(app)
    created = client.post("/api/folders", json={"name": "Semana prueba"})
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["name"] == "Semana prueba"
    assert body["id"] > 0
    assert body["status"] == "OPEN"

    listed = client.get("/api/folders")
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert any(row["id"] == body["id"] for row in items)

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json().get("folders_api") is True


def test_delete_folder():
    get_settings.cache_clear()
    init_db()
    from api_server import app

    client = TestClient(app)
    created = client.post("/api/folders", json={"name": "Para borrar"})
    assert created.status_code == 200
    folder_id = created.json()["id"]

    deleted = client.delete(f"/api/folders/{folder_id}")
    assert deleted.status_code == 200
    assert deleted.json().get("ok") is True

    missing = client.get(f"/api/folders/{folder_id}")
    assert missing.status_code == 404

    listed = client.get("/api/folders")
    assert all(row["id"] != folder_id for row in listed.json()["items"])


def test_link_autobits_batch_to_folder():
    get_settings.cache_clear()
    init_db()
    from api_server import app
    from infrastructure.persistence.database import SessionLocal
    from infrastructure.persistence.models import ImportBatchModel

    client = TestClient(app)
    created = client.post("/api/folders", json={"name": "Semana COM"})
    assert created.status_code == 200, created.text
    folder_id = created.json()["id"]

    db = SessionLocal()
    try:
        batch = ImportBatchModel(
            filename="autobits.xlsx",
            period_start="2026-09-13",
            period_end="2026-09-19",
            imported_by="test",
            status="IMPORTADO",
            total_rows=1,
            imported_rows=1,
        )
        db.add(batch)
        db.commit()
        db.refresh(batch)
        batch_id = batch.id
    finally:
        db.close()

    linked = client.post(f"/api/folders/{folder_id}/autobits", json={"batch_id": batch_id})
    assert linked.status_code == 200, linked.text
    assert linked.json()["autobits_batch_id"] == batch_id
    assert linked.json()["status"] == "READY"

    got = client.get(f"/api/folders/{folder_id}")
    assert got.status_code == 200
    assert got.json()["autobits_batch_id"] == batch_id


def test_folder_count_ignora_facturas_borradas():
    get_settings.cache_clear()
    init_db()
    from api_server import app
    from infrastructure.persistence.database import SessionLocal
    from infrastructure.persistence.models import DocumentModel, InvoiceFolderModel
    import json

    client = TestClient(app)
    created = client.post("/api/folders", json={"name": "Con fantasmas"})
    folder_id = created.json()["id"]

    db = SessionLocal()
    try:
        doc = DocumentModel(filename="viva.pdf", tipo="FACTURA", origen="CARGA_MANUAL")
        db.add(doc)
        db.commit()
        db.refresh(doc)
        alive_id = doc.id
        folder = db.get(InvoiceFolderModel, folder_id)
        folder.document_ids_json = json.dumps([alive_id, 999001, 999002])
        db.commit()
        db.delete(doc)
        db.commit()
    finally:
        db.close()

    got = client.get(f"/api/folders/{folder_id}")
    assert got.status_code == 200
    body = got.json()
    assert body["document_ids"] == []
    assert body["document_count"] == 0
    assert body["documents"] == []

