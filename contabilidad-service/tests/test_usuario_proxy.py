"""Identidad del usuario recibida del proxy SIG — Fase 4.1."""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from api.deps import USUARIO_SISTEMA, resolve_rol, resolve_usuario
from config.settings import get_settings
from domain.enums import CrossingStatus, DocumentStatus
from infrastructure.persistence.database import SessionLocal, init_db
from infrastructure.persistence.models import (
    AccountCrossingModel,
    AuditLogModel,
    DocumentModel,
    ProviderModel,
)


class _FakeRequest:
    def __init__(self, headers: dict[str, str]):
        self.headers = headers


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


def test_resolve_usuario_prefiere_la_cabecera():
    request = _FakeRequest({"X-SIG-Username": "andrea.contable"})
    assert resolve_usuario(request, "ANDREA") == "andrea.contable"


def test_resolve_usuario_cae_al_cuerpo_por_compatibilidad():
    assert resolve_usuario(_FakeRequest({}), "katherine.ops") == "katherine.ops"
    assert resolve_usuario(None, "katherine.ops") == "katherine.ops"


def test_resolve_usuario_ignora_valores_vacios_o_basura():
    assert resolve_usuario(_FakeRequest({"X-SIG-Username": "   "}), "gerencia") == "gerencia"
    assert resolve_usuario(_FakeRequest({"X-SIG-Username": "null"}), None) == USUARIO_SISTEMA
    assert resolve_usuario(_FakeRequest({}), "  ") == USUARIO_SISTEMA
    assert resolve_usuario(None, None) == USUARIO_SISTEMA


def test_resolve_usuario_recorta_valores_muy_largos():
    largo = "u" * 500
    assert len(resolve_usuario(_FakeRequest({"X-SIG-Username": largo}))) == 128


def test_resolve_rol():
    assert resolve_rol(_FakeRequest({"X-SIG-Role": "CONTABILIDAD"})) == "CONTABILIDAD"
    assert resolve_rol(_FakeRequest({})) is None


def test_resolve_roles_lista_y_reopen():
    from api.deps import ROLES_REOPEN, resolve_roles

    assert resolve_roles(_FakeRequest({"X-SIG-Role": "ADMINISTRADOR,CONTABILIDAD"})) == {
        "ADMINISTRADOR",
        "CONTABILIDAD",
    }
    assert resolve_roles(_FakeRequest({"X-SIG-Role": "ROLE_GERENCIA"})) == {"GERENCIA"}
    assert resolve_roles(_FakeRequest({"X-SIG-Role": "SUPERVISOR"})) & ROLES_REOPEN == set()


def test_assert_can_write_bloquea_rol_invalido():
    from fastapi import HTTPException

    from api.deps import assert_can_write_contabilidad

    with pytest.raises(HTTPException) as exc:
        assert_can_write_contabilidad(_FakeRequest({"X-SIG-Role": "COMERCIAL"}))
    assert exc.value.status_code == 403


def test_assert_can_write_permite_roles_ap():
    from api.deps import assert_can_write_contabilidad

    assert_can_write_contabilidad(_FakeRequest({"X-SIG-Role": "CONTABILIDAD"}))
    assert_can_write_contabilidad(_FakeRequest({"X-SIG-Role": "SUPERVISOR"}))
    assert_can_write_contabilidad(_FakeRequest({}))  # sin cabecera: tests/scripts


def test_auditoria_registra_el_usuario_de_la_cabecera(client, db):
    provider = ProviderModel(nombre="Proxy Test", nit="904000001")
    doc = DocumentModel(
        filename="proxy.jpg",
        tipo="FACTURA",
        origen="CARGA_MANUAL",
        estado=DocumentStatus.APROBADO,
        numero_documento="FX-1",
        total=300000.0,
        provider=provider,
    )
    db.add_all([provider, doc])
    db.flush()
    crossing = AccountCrossingModel(
        document_id=doc.id,
        match_type="MATCH_EXACTO",
        estado=CrossingStatus.APROBADO,
        proveedor_nombre="Proxy Test",
        valor_documento=300000.0,
        valor_autobits=300000.0,
    )
    db.add(crossing)
    db.commit()
    crossing_id = crossing.id

    pago = client.post(
        "/api/payments",
        json={"crossing_id": crossing_id, "usuario": "ANDREA"},
        headers={"X-SIG-Username": "jefa.gerencia", "X-SIG-Role": "GERENCIA"},
    )
    assert pago.status_code == 200

    log = (
        db.query(AuditLogModel)
        .filter(
            AuditLogModel.entidad == "Payment",
            AuditLogModel.entidad_id == str(pago.json()["id"]),
        )
        .first()
    )
    assert log is not None
    assert log.usuario == "jefa.gerencia"


def test_sin_cabecera_ni_cuerpo_se_audita_como_sistema(client, db):
    provider = ProviderModel(nombre="Proxy Sistema", nit="904000002")
    doc = DocumentModel(
        filename="sistema.jpg",
        tipo="FACTURA",
        origen="CARGA_MANUAL",
        estado=DocumentStatus.APROBADO,
        numero_documento="FX-2",
        total=300000.0,
        provider=provider,
    )
    db.add_all([provider, doc])
    db.flush()
    crossing = AccountCrossingModel(
        document_id=doc.id,
        match_type="MATCH_EXACTO",
        estado=CrossingStatus.APROBADO,
        proveedor_nombre="Proxy Sistema",
        valor_documento=300000.0,
        valor_autobits=300000.0,
    )
    db.add(crossing)
    db.commit()

    pago = client.post("/api/payments", json={"crossing_id": crossing.id})
    assert pago.status_code == 200

    log = (
        db.query(AuditLogModel)
        .filter(
            AuditLogModel.entidad == "Payment",
            AuditLogModel.entidad_id == str(pago.json()["id"]),
        )
        .first()
    )
    assert log is not None
    assert log.usuario == USUARIO_SISTEMA
