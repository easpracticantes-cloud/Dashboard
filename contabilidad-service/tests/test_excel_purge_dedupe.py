"""Tests — purge Excels y bloqueo de archivo repetido."""

import io
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from config.settings import get_settings  # noqa: E402
from infrastructure.ai.excel_ai_analyzer import ExcelAIAnalysis  # noqa: E402
from infrastructure.persistence.database import init_db  # noqa: E402


def _fake_analysis():
    return ExcelAIAnalysis(
        mapping={
            "proveedor": "Nombre Proveedor (Orden de Compra)",
            "nit": "NIT/CC Proveedor (Orden de Compra)",
            "numero_compra": "Codigo Orden de compra",
            "numero_reserva": "Codigo Reserva",
            "numero_documento": None,
            "valor": "Total",
            "fecha": "Fecha de ejecución (Reserva)",
            "concepto": "Nombre concepto",
            "observaciones": "OBSERVACIONES",
            "estado_compra": "estado de la compra",
        },
        period_start="2026-08-16",
        period_end="2026-08-22",
        mode="ia",
        sheet_notes="test",
    )


def _vaciar_tablas():
    from infrastructure.persistence.database import engine
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys = OFF"))
        tablas = [
            row[0]
            for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
            if not row[0].startswith("sqlite_")
        ]
        for tabla in tablas:
            conn.execute(text(f'DELETE FROM "{tabla}"'))


@pytest.fixture
def client():
    get_settings.cache_clear()
    init_db()
    _vaciar_tablas()
    from api_server import app

    yield TestClient(app)
    _vaciar_tablas()


def _xlsx() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(
        [
            "NIT/CC Proveedor (Orden de Compra)",
            "Nombre Proveedor (Orden de Compra)",
            "Codigo Orden de compra",
            "Codigo Reserva",
            "Total",
            "Fecha de ejecución (Reserva)",
            "Nombre concepto",
            "OBSERVACIONES",
            "estado de la compra",
        ]
    )
    ws.append(["9001", "Proveedor A", "OC-1", "R-1", 100000, "2026-08-18", "Servicio", "", "PENDIENTE"])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_bloquea_excel_autobits_repetido(client):
    content = _xlsx()
    with patch(
        "application.services.autobits_service.ExcelAIAnalyzer.analyze",
        return_value=_fake_analysis(),
    ):
        r1 = client.post(
            "/api/autobits/upload",
            files={"archivo": ("semana.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"auto_cruzar": "false"},
        )
        assert r1.status_code == 200, r1.text
        r2 = client.post(
            "/api/autobits/upload",
            files={"archivo": ("semana.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"auto_cruzar": "false"},
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body.get("reused") is True
        assert body.get("imported_rows", 0) >= 1
        assert body.get("records")


def test_purge_excels(client):
    content = _xlsx()
    with patch(
        "application.services.autobits_service.ExcelAIAnalyzer.analyze",
        return_value=_fake_analysis(),
    ):
        r1 = client.post(
            "/api/autobits/upload",
            files={"archivo": ("semana.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"auto_cruzar": "true"},
        )
        assert r1.status_code == 200, r1.text

    bad = client.delete("/api/autobits/excels")
    assert bad.status_code == 400

    purged = client.delete("/api/autobits/excels?confirm=true")
    assert purged.status_code == 200, purged.text
    body = purged.json()
    assert body["ok"] is True
    assert body["deleted"]["batches"] >= 1

    latest = client.get("/api/autobits/batches/latest")
    assert latest.status_code == 404


def test_purge_vacia_ids_de_carpeta_y_permite_resubir(client):
    """Vaciar no puede dejar la carpeta con IDs fantasma (contador 15 y facturas 'revividas')."""
    from infrastructure.persistence.database import SessionLocal
    from infrastructure.persistence.models import DocumentModel, InvoiceFolderModel

    folder = client.post("/api/folders", json={"name": "Semana fantasma"}).json()
    folder_id = folder["id"]

    db = SessionLocal()
    try:
        docs = [
            DocumentModel(filename=f"f{i}.pdf", tipo="FACTURA", origen="CARGA_MANUAL")
            for i in range(3)
        ]
        db.add_all(docs)
        db.commit()
        ids = [d.id for d in docs]
        row = db.get(InvoiceFolderModel, folder_id)
        row.document_ids_json = __import__("json").dumps(ids)
        db.commit()
    finally:
        db.close()

    listed = client.get("/api/folders")
    assert listed.status_code == 200
    chip = next(item for item in listed.json()["items"] if item["id"] == folder_id)
    assert chip["document_count"] == 3

    purged = client.delete("/api/autobits/excels?confirm=true")
    assert purged.status_code == 200, purged.text
    assert purged.json()["deleted"].get("documents", 0) >= 3
    assert purged.json()["deleted"].get("folders_cleared", 0) >= 1

    after = client.get(f"/api/folders/{folder_id}")
    assert after.status_code == 200
    body = after.json()
    assert body["document_ids"] == []
    assert body["document_count"] == 0
    assert body["documents"] == []
    assert body["autobits_batch_id"] is None

    db = SessionLocal()
    try:
        nuevo = DocumentModel(filename="nueva.pdf", tipo="FACTURA", origen="CARGA_MANUAL")
        db.add(nuevo)
        db.commit()
        db.refresh(nuevo)
        new_id = nuevo.id
    finally:
        db.close()

    linked = client.post(f"/api/folders/{folder_id}/documents", json={"document_ids": [new_id]})
    assert linked.status_code == 200, linked.text
    assert linked.json()["added"] == 1
    assert linked.json()["folder"]["document_count"] == 1
    assert linked.json()["folder"]["document_ids"] == [new_id]

