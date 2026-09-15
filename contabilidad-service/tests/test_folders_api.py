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
