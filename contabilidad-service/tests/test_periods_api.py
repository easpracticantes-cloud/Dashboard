"""Cierre operativo semanal — Fase 4.6."""

import sys
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from application.services.period_service import PeriodClosedError, PeriodService
from config.settings import get_settings
from domain.enums import CrossingStatus, DocumentStatus, PeriodClosureStatus
from domain.utils.period_utils import week_bounds_saturday
from infrastructure.persistence.database import SessionLocal, init_db
from infrastructure.persistence.models import AccountCrossingModel, DocumentModel, ProviderModel


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


@pytest.fixture
def semana_abierta_al_final():
    """Reabre la semana vigente pase lo que pase: la BD de tests es compartida."""
    yield
    session = SessionLocal()
    try:
        service = PeriodService(session)
        if service.is_period_closed():
            service.reopen(motivo="Limpieza de la suite de tests", usuario="TEST")
    finally:
        session.close()


def _seed_crossing(db: Session, nit: str) -> AccountCrossingModel:
    provider = ProviderModel(nombre=f"Cierre {nit}", nit=nit)
    doc = DocumentModel(
        filename=f"cierre-{nit}.jpg",
        tipo="FACTURA",
        origen="CARGA_MANUAL",
        estado=DocumentStatus.APROBADO,
        numero_documento=f"FC-{nit}",
        total=500000.0,
        provider=provider,
    )
    db.add(provider)
    db.add(doc)
    db.flush()
    crossing = AccountCrossingModel(
        document_id=doc.id,
        match_type="MATCH_EXACTO",
        estado=CrossingStatus.APROBADO,
        proveedor_nombre=provider.nombre,
        valor_documento=500000.0,
        valor_autobits=500000.0,
    )
    db.add(crossing)
    db.commit()
    db.refresh(crossing)
    return crossing


def test_status_semana_vigente_abierta_por_defecto(client):
    inicio, fin = week_bounds_saturday(date.today())
    respuesta = client.get("/api/periods/status")
    assert respuesta.status_code == 200
    data = respuesta.json()
    assert data["period_start"] == inicio.isoformat()
    assert data["period_end"] == fin.isoformat()
    assert data["status"] == PeriodClosureStatus.OPEN
    assert data["cerrado"] is False


def test_cerrar_semana_bloquea_pagos_y_cruces(client, db, semana_abierta_al_final):
    crossing = _seed_crossing(db, "902000001")
    doc_id = crossing.document_id

    cierre = client.post("/api/periods/close", json={"observaciones": "Cierre de prueba"})
    assert cierre.status_code == 200
    body = cierre.json()
    assert body["status"] == PeriodClosureStatus.CLOSED
    assert body["summary"]["kpis"]["periodo"]["inicio"] == body["period_start"]

    pago = client.post("/api/payments", json={"crossing_id": crossing.id})
    assert pago.status_code == 409
    assert "cerrado" in pago.json()["detail"]

    aprobar = client.post(f"/api/crossings/{crossing.id}/approve", json={})
    assert aprobar.status_code == 409

    completar = client.patch(
        f"/api/crossings/{crossing.id}/complete",
        json={"factura_cdc": "FE-999"},
    )
    assert completar.status_code == 409

    borrar = client.delete(f"/api/documents/{doc_id}")
    assert borrar.status_code == 409


def test_reabrir_exige_motivo_y_restaura_la_operacion(client, db, semana_abierta_al_final):
    crossing = _seed_crossing(db, "902000002")
    client.post("/api/periods/close", json={})

    sin_motivo = client.post(
        "/api/periods/reopen",
        json={"motivo": "  "},
        headers={"X-SIG-Role": "GERENCIA", "X-SIG-Username": "gerencia.aves"},
    )
    assert sin_motivo.status_code == 400

    reapertura = client.post(
        "/api/periods/reopen",
        json={"motivo": "Faltó registrar una factura"},
        headers={"X-SIG-Username": "gerencia.aves", "X-SIG-Role": "GERENCIA"},
    )
    assert reapertura.status_code == 200
    assert reapertura.json()["status"] == PeriodClosureStatus.OPEN
    assert reapertura.json()["reopened_by"] == "gerencia.aves"

    pago = client.post("/api/payments", json={"crossing_id": crossing.id})
    assert pago.status_code == 200


def test_reopen_solo_admin_o_gerencia(client, semana_abierta_al_final):
    assert client.post("/api/periods/close", json={}).status_code == 200

    for rol in ("ADMINISTRADOR", "GERENCIA"):
        ok = client.post(
            "/api/periods/reopen",
            json={"motivo": f"Reapertura por {rol}"},
            headers={"X-SIG-Username": f"user.{rol.lower()}", "X-SIG-Role": rol},
        )
        assert ok.status_code == 200, rol
        assert client.post("/api/periods/close", json={}).status_code == 200

    for rol in ("CONTABILIDAD", "SUPERVISOR"):
        denied = client.post(
            "/api/periods/reopen",
            json={"motivo": "Intento no autorizado"},
            headers={"X-SIG-Username": f"user.{rol.lower()}", "X-SIG-Role": rol},
        )
        assert denied.status_code == 403, rol
        assert "ADMINISTRADOR" in denied.json()["detail"]


def test_no_se_cierra_dos_veces_la_misma_semana(client, semana_abierta_al_final):
    assert client.post("/api/periods/close", json={}).status_code == 200
    repetido = client.post("/api/periods/close", json={})
    assert repetido.status_code == 409
    assert "ya está cerrada" in repetido.json()["detail"]


def test_pago_no_avanza_con_periodo_cerrado(client, db, semana_abierta_al_final):
    """Approve / mark_paid / receipt / package bloqueados; anulación y ajuste OK."""
    import io

    from PIL import Image

    from application.services.payment_service import PaymentService

    crossing = _seed_crossing(db, "902000010")
    payments = PaymentService(db)
    creado = payments.create_from_crossing(crossing.id, usuario="TEST")
    pago_id = creado["id"]
    doc_id = crossing.document_id

    assert client.post("/api/periods/close", json={}).status_code == 200
    assert client.post(f"/api/payments/{pago_id}/approve", json={}).status_code == 409

    assert (
        client.post(
            "/api/periods/reopen",
            json={"motivo": "Continuar flujo de prueba"},
            headers={"X-SIG-Role": "GERENCIA", "X-SIG-Username": "gerencia"},
        ).status_code
        == 200
    )
    assert client.post(f"/api/payments/{pago_id}/approve", json={}).status_code == 200

    assert client.post("/api/periods/close", json={}).status_code == 200
    assert client.post(f"/api/payments/{pago_id}/mark-paid", json={}).status_code == 409

    assert (
        client.post(
            "/api/periods/reopen",
            json={"motivo": "Confirmar transferencia de prueba"},
            headers={"X-SIG-Role": "ADMINISTRADOR", "X-SIG-Username": "admin"},
        ).status_code
        == 200
    )
    assert client.post(f"/api/payments/{pago_id}/mark-paid", json={}).status_code == 200

    assert client.post("/api/periods/close", json={}).status_code == 200

    buf = io.BytesIO()
    Image.new("RGB", (20, 20), color=(100, 100, 100)).save(buf, format="JPEG")
    receipt = client.post(
        f"/api/payments/{pago_id}/receipt",
        files={"archivo": ("c.jpg", buf.getvalue(), "image/jpeg")},
    )
    assert receipt.status_code == 409

    pkg = client.post("/api/packages", json={"document_id": doc_id, "payment_id": pago_id})
    assert pkg.status_code == 409

    assert (
        client.post(
            f"/api/payments/{pago_id}/adjust",
            json={"valor": 510000, "motivo": "Ajuste con período cerrado"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/payments/{pago_id}/annul",
            json={"motivo": "Anulación tras cierre semanal de prueba"},
        ).status_code
        == 200
    )


def test_anular_pago_sigue_disponible_con_periodo_cerrado(client, db, semana_abierta_al_final):
    from application.services.payment_service import PaymentService

    crossing = _seed_crossing(db, "902000003")
    service = PaymentService(db)
    pago = service.create_from_crossing(crossing.id, usuario="ANDREA")

    assert client.post("/api/periods/close", json={}).status_code == 200

    anulado = client.post(
        f"/api/payments/{pago['id']}/annul",
        json={"motivo": "Corrección posterior al cierre semanal"},
    )
    assert anulado.status_code == 200
    assert anulado.json()["anulado"] is True


def test_is_period_closed_solo_afecta_a_la_semana_cerrada(db, semana_abierta_al_final):
    service = PeriodService(db)
    inicio, fin = week_bounds_saturday(date.today())
    service.close_week(usuario="TEST")

    assert service.is_period_closed(inicio) is True
    assert service.is_period_closed(fin) is True
    assert service.is_period_closed(inicio.replace(year=inicio.year - 1)) is False

    with pytest.raises(PeriodClosedError) as exc:
        service.ensure_period_open(accion="generar pagos")
    assert "generar pagos" in exc.value.message
