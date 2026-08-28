"""Tests API health y documentos."""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from config.settings import get_settings  # noqa: E402
from infrastructure.persistence.database import init_db  # noqa: E402


@pytest.fixture
def client():
    get_settings.cache_clear()
    init_db()
    from api_server import app

    return TestClient(app)


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert "ok" in data
    assert "tesseract" in data
    assert "ollama" in data


def test_documents_empty(client):
    response = client.get("/api/documents")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []
