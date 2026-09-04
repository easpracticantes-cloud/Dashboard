"""Cadena documental, cola operativa y alertas — Fase 4.5/4.6."""

import io
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from application.services.payment_service import PaymentService
from config.settings import get_settings
from domain.enums import (
    AutobitsRecordStatus,
    CrossingStatus,
    DocumentStatus,
    ImportBatchStatus,
    RemediationStatus,
    RemediationType,
)
from infrastructure.persistence.database import SessionLocal, init_db
from infrastructure.persistence.models import (
    AccountCrossingModel,
    AutobitsRecordModel,
    DocumentModel,
    ImportBatchModel,
    ProviderModel,
    RemediationModel,
)


@pytest.fixture
def client():
    get_settings.cache_clear()
    init_db()
    from api_server import app

    return TestClient(app)


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _imagen() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), color=(210, 210, 210)).save(buf, format="JPEG")
    return buf.getvalue()


def _cadena_completa(db: Session, nit: str) -> tuple[int, int]:
    """Documento con Autobits, cruce y pago; devuelve (document_id, crossing_id)."""
    batch = ImportBatchModel(
        filename="semana_ops.xlsx",
        status=ImportBatchStatus.COMPLETED,
        imported_by="TEST",
    )
    db.add(batch)
    db.flush()
    record = AutobitsRecordModel(
        import_batch_id=batch.id,
        proveedor=f"Ops {nit}",
        nit=nit,
        numero_compra=f"OC-{nit}",
        numero_reserva=f"OR-{nit}",
        valor=600000.0,
        estado=AutobitsRecordStatus.IMPORTADO,
    )
    provider = ProviderModel(nombre=f"Ops {nit}", nit=nit)
    doc = DocumentModel(
        filename=f"ops-{nit}.jpg",
        tipo="FACTURA",
        origen="AUTOBITS",
        estado=DocumentStatus.APROBADO,
        numero_documento=f"FO-{nit}",
        total=600000.0,
        provider=provider,
    )
    db.add_all([record, provider, doc])
    db.flush()
    crossing = AccountCrossingModel(
        document_id=doc.id,
        autobits_record_id=record.id,
        match_type="MATCH_EXACTO",
        estado=CrossingStatus.APROBADO,
        proveedor_nombre=provider.nombre,
        numero_compra=record.numero_compra,
        valor_documento=600000.0,
        valor_autobits=600000.0,
    )
    db.add(crossing)
    db.commit()
    return doc.id, crossing.id


def test_chain_reporta_eslabones_faltantes(client, db):
    doc_id, crossing_id = _cadena_completa(db, "903000001")

    chain = client.get(f"/api/ops/chain/{doc_id}")
    assert chain.status_code == 200
    data = chain.json()
    assert data["document"]["id"] == doc_id
    assert data["autobits"]["numero_compra"] == "OC-903000001"
    assert data["crossing"]["id"] == crossing_id
    assert data["payment"] is None
    assert data["receipt"] is False
    assert data["package"] is None
    assert data["missing_links"] == ["payment", "receipt", "package"]
    assert data["status"] == "INCOMPLETA"


def test_chain_completa_tras_pago_y_comprobante(client, db):
    doc_id, crossing_id = _cadena_completa(db, "903000002")

    pago = client.post("/api/payments", json={"crossing_id": crossing_id}).json()
    client.post(f"/api/payments/{pago['id']}/approve", json={})
    client.post(f"/api/payments/{pago['id']}/mark-paid", json={})
    subida = client.post(
        f"/api/payments/{pago['id']}/receipt",
        files={"archivo": ("comprobante.jpg", _imagen(), "image/jpeg")},
        data={"contramarcado": "true"},
    )
    assert subida.status_code == 200

    data = client.get(f"/api/ops/chain/{doc_id}").json()
    assert data["payment"]["id"] == pago["id"]
    assert data["receipt"] is True
    assert data["package"] is None
    assert data["missing_links"] == ["package"]
    assert data["status"] == "INCOMPLETA"

    pkg = client.post(
        "/api/packages",
        json={"document_id": doc_id, "payment_id": pago["id"]},
        headers={"X-SIG-Username": "ops.user"},
    )
    assert pkg.status_code == 200
    completa = client.get(f"/api/ops/chain/{doc_id}").json()
    assert completa["package"]["id"] == pkg.json()["id"]
    assert completa["package"]["document_id"] == doc_id
    assert completa["package"]["payment_id"] == pago["id"]
    assert completa["missing_links"] == []
    assert completa["status"] == "COMPLETA"


def test_chain_por_query_es_equivalente(client, db):
    doc_id, _ = _cadena_completa(db, "903000003")
    por_ruta = client.get(f"/api/ops/chain/{doc_id}").json()
    por_query = client.get("/api/reconciliation/chain", params={"document_id": doc_id}).json()
    assert por_ruta == por_query


def test_chain_documento_inexistente(client):
    assert client.get("/api/ops/chain/999999").status_code == 404


def test_queue_agrupa_pendientes_del_periodo(client, db):
    _, crossing_id = _cadena_completa(db, "903000004")
    client.post("/api/payments", json={"crossing_id": crossing_id})

    provider = ProviderModel(nombre="Duplicado Ops", nit="903000005")
    duplicado = DocumentModel(
        filename="duplicado.jpg",
        tipo="FACTURA",
        origen="CARGA_MANUAL",
        estado=DocumentStatus.DUPLICADO,
        total=100000.0,
        provider=provider,
    )
    pendiente = DocumentModel(
        filename="pendiente.jpg",
        tipo="FACTURA",
        origen="CARGA_MANUAL",
        estado=DocumentStatus.EXTRAIDO,
        total=100000.0,
    )
    db.add_all([provider, duplicado, pendiente])
    db.flush()
    db.add(
        AccountCrossingModel(
            document_id=pendiente.id,
            match_type="SIN_MATCH",
            estado=CrossingStatus.PENDIENTE,
            proveedor_nombre="Pendiente Ops",
        )
    )
    db.add(
        RemediationModel(
            document_id=pendiente.id,
            tipo_problema=RemediationType.SIN_MATCH,
            descripcion="Sin coincidencia en Autobits",
            estado=RemediationStatus.PENDIENTE,
        )
    )
    db.commit()

    queue = client.get("/api/ops/queue").json()
    conteos = queue["conteos"]
    assert conteos["pagos_sin_confirmacion_bancaria"] >= 1
    assert conteos["cruces_incompletos"] >= 1
    assert conteos["documentos_duplicados"] >= 1
    assert conteos["subsanaciones_abiertas"] >= 1
    assert queue["total_pendientes"] >= 4
    assert queue["totales"]["valor_sin_confirmacion_bancaria"] >= 600000.0


def test_queue_detecta_pagos_sin_comprobante(client, db):
    _, crossing_id = _cadena_completa(db, "903000006")
    service = PaymentService(db)
    pago = service.create_from_crossing(crossing_id)
    service.approve(pago["id"])
    service.mark_paid(pago["id"])

    queue = client.get("/api/ops/queue").json()
    faltantes = [p["id"] for p in queue["items"]["comprobantes_faltantes"]]
    assert pago["id"] in faltantes


def test_alerts_prioriza_por_severidad(client, db):
    _, crossing_id = _cadena_completa(db, "903000007")
    client.post("/api/payments", json={"crossing_id": crossing_id})

    alerts = client.get("/api/ops/alerts").json()
    assert alerts["total_alertas"] >= 1
    codigos = [a["codigo"] for a in alerts["alertas"]]
    assert "pagos_sin_confirmacion_bancaria" in codigos
    assert alerts["alertas"][0]["severidad"] == "CRITICA"


def test_kpis_no_devuelven_periodo_completo_cuando_el_filtro_no_deja_documentos(client, db):
    _, crossing_id = _cadena_completa(db, "903000008")
    client.post("/api/payments", json={"crossing_id": crossing_id})

    kpis = client.get(
        "/api/dashboard/kpis",
        params={"proveedor": "proveedor-que-no-existe-en-ningun-lado"},
    ).json()

    assert kpis["conteos"]["documentos_recibidos"] == 0
    assert kpis["conteos"]["pagos_pendientes"] == 0
    assert kpis["conteos"]["cruces_aprobados"] == 0
    assert kpis["conteos"]["subsanaciones_pendientes"] == 0
    assert kpis["totales"]["valor_pendiente_pago"] == 0.0
