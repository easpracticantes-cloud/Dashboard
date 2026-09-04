"""Integridad del flujo de pagos — Fase 4.2.

Regla del negocio: solo la confirmación bancaria (`mark_paid`) marca PAGADO.
Crear el pago deja el cruce en APROBADO.
"""

import sys
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from application.services.payment_service import PaymentService, PaymentServiceError
from config.settings import get_settings
from domain.enums import AdjustmentAction, CrossingStatus, DocumentStatus, PaymentStatus
from infrastructure.payments.manual_payment_provider import ManualPaymentProvider
from infrastructure.persistence.database import SessionLocal, init_db
from infrastructure.persistence.models import (
    AccountCrossingModel,
    AccountingAdjustmentModel,
    DocumentModel,
    ProviderModel,
)


@pytest.fixture(autouse=True)
def _db_lista():
    get_settings.cache_clear()
    init_db()


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _seed_crossing(db: Session, *, nit: str, valor: float = 750000.0) -> AccountCrossingModel:
    provider = ProviderModel(nombre=f"Proveedor {nit}", nit=nit)
    doc = DocumentModel(
        filename=f"factura-{nit}.jpg",
        tipo="FACTURA",
        origen="CARGA_MANUAL",
        estado=DocumentStatus.APROBADO,
        numero_documento=f"FP-{nit}",
        total=valor,
        provider=provider,
    )
    db.add(provider)
    db.add(doc)
    db.flush()
    crossing = AccountCrossingModel(
        document_id=doc.id,
        match_type="MATCH_EXACTO",
        match_score=95.0,
        estado=CrossingStatus.APROBADO,
        proveedor_nombre=provider.nombre,
        numero_compra=f"CP-{nit}",
        numero_reserva=f"RS-{nit}",
        valor_documento=valor,
        valor_autobits=valor,
        diferencia=0.0,
    )
    db.add(crossing)
    db.commit()
    db.refresh(crossing)
    return crossing


def test_crear_pago_no_marca_el_cruce_como_pagado(db):
    crossing = _seed_crossing(db, nit="901000001")
    service = PaymentService(db)

    pago = service.create_from_crossing(crossing.id, usuario="ANDREA")

    db.refresh(crossing)
    assert pago["estado"] == PaymentStatus.PENDIENTE_APROBACION
    assert crossing.estado == CrossingStatus.APROBADO
    assert crossing.fecha_pago is None
    assert crossing.document.estado == DocumentStatus.PENDIENTE_PAGO


def test_mark_paid_es_el_unico_que_marca_pagado(db):
    crossing = _seed_crossing(db, nit="901000002")
    service = PaymentService(db)
    pago = service.create_from_crossing(crossing.id, usuario="ANDREA")

    aprobado = service.approve(pago["id"], usuario="ANDREA")
    db.refresh(crossing)
    assert aprobado["estado"] == PaymentStatus.PENDIENTE_PAGO
    assert crossing.estado == CrossingStatus.APROBADO

    pagado = service.mark_paid(pago["id"], usuario="ANDREA", observaciones="Bancolombia")
    db.refresh(crossing)
    assert pagado["estado"] == PaymentStatus.PAGADO
    assert crossing.estado == CrossingStatus.PAGADO
    assert crossing.fecha_pago
    assert crossing.document.estado == DocumentStatus.PAGADO


def test_no_se_puede_marcar_pagado_sin_aprobar(db):
    crossing = _seed_crossing(db, nit="901000003")
    service = PaymentService(db)
    pago = service.create_from_crossing(crossing.id)

    with pytest.raises(PaymentServiceError) as exc:
        service.mark_paid(pago["id"], usuario="ANDREA")

    assert exc.value.code == "INVALID_TRANSITION"
    assert "PENDIENTE_APROBACION" in exc.value.message


def test_transiciones_permitidas_del_proveedor_manual():
    provider = ManualPaymentProvider()
    assert provider.can_transition(PaymentStatus.PENDIENTE_PAGO, PaymentStatus.PAGADO) is True
    assert provider.can_transition(PaymentStatus.PENDIENTE_APROBACION, PaymentStatus.PAGADO) is False
    assert provider.can_transition(PaymentStatus.ANULADO, PaymentStatus.PAGADO) is False
    assert provider.requires_strong_reason(PaymentStatus.PAGADO) is True
    assert provider.requires_strong_reason(PaymentStatus.PENDIENTE_APROBACION) is False


def test_anular_pago_revierte_la_cadena_y_deja_ajuste(db):
    crossing = _seed_crossing(db, nit="901000004")
    service = PaymentService(db)
    pago = service.create_from_crossing(crossing.id)
    service.approve(pago["id"], usuario="ANDREA")
    service.mark_paid(pago["id"], usuario="ANDREA")

    anulado = service.annul(
        pago["id"],
        motivo="Transferencia devuelta por el banco",
        usuario="ANDREA",
    )

    db.refresh(crossing)
    assert anulado["estado"] == PaymentStatus.ANULADO
    assert anulado["anulado"] is True
    assert crossing.estado == CrossingStatus.APROBADO
    assert crossing.fecha_pago is None
    assert crossing.document.estado == DocumentStatus.APROBADO

    ajustes = (
        db.query(AccountingAdjustmentModel)
        .filter(AccountingAdjustmentModel.entity_id == str(pago["id"]))
        .all()
    )
    assert len(ajustes) == 1
    assert ajustes[0].action == AdjustmentAction.ANULACION
    assert PaymentStatus.PAGADO in ajustes[0].valor_anterior
    assert ajustes[0].usuario == "ANDREA"


def test_anular_exige_motivo(db):
    crossing = _seed_crossing(db, nit="901000005")
    service = PaymentService(db)
    pago = service.create_from_crossing(crossing.id)

    with pytest.raises(PaymentServiceError) as exc:
        service.annul(pago["id"], motivo="   ")
    assert exc.value.code == "MOTIVO_REQUERIDO"


def test_anular_pago_ejecutado_exige_motivo_detallado(db):
    crossing = _seed_crossing(db, nit="901000006")
    service = PaymentService(db)
    pago = service.create_from_crossing(crossing.id)
    service.approve(pago["id"])
    service.mark_paid(pago["id"])

    with pytest.raises(PaymentServiceError) as exc:
        service.annul(pago["id"], motivo="error")
    assert exc.value.code == "MOTIVO_INSUFICIENTE"


def test_pago_anulado_libera_el_cruce_para_un_nuevo_pago(db):
    crossing = _seed_crossing(db, nit="901000007")
    service = PaymentService(db)
    primero = service.create_from_crossing(crossing.id)

    with pytest.raises(PaymentServiceError) as exc:
        service.create_from_crossing(crossing.id)
    assert exc.value.code == "DUPLICATE"

    service.annul(primero["id"], motivo="Valor equivocado en el cruce")
    segundo = service.create_from_crossing(crossing.id)
    assert segundo["id"] != primero["id"]
    assert segundo["estado"] == PaymentStatus.PENDIENTE_APROBACION


def test_ajuste_de_valor_registra_importe_anterior(db):
    crossing = _seed_crossing(db, nit="901000008", valor=1_000_000.0)
    service = PaymentService(db)
    pago = service.create_from_crossing(crossing.id)

    ajustado = service.adjust_value(
        pago["id"],
        valor="1.190.000",
        motivo="Se incluyó el IVA omitido",
        usuario="ANDREA",
    )

    assert ajustado["valor"] == 1190000.0
    ajustes = service.list_adjustments(pago["id"])
    assert ajustes[0]["action"] == AdjustmentAction.AJUSTE
    assert ajustes[0]["valor_anterior"] == "1000000.00"
    assert ajustes[0]["valor_nuevo"] == "1190000.00"


def test_pago_solo_se_genera_desde_cruce_aprobado(db):
    crossing = _seed_crossing(db, nit="901000009")
    crossing.estado = CrossingStatus.PENDIENTE
    db.commit()

    with pytest.raises(PaymentServiceError) as exc:
        PaymentService(db).create_from_crossing(crossing.id)
    assert exc.value.code == "CROSSING_NOT_APPROVED"


def test_pagado_legitimo_no_se_degrada_al_completar_ni_reesolver(db):
    """G) Un CrossingStatus.PAGADO de mark_paid no se degrada en complete/re-resolve."""
    from application.services.crossing_service import CrossingService
    from infrastructure.persistence.models import AutobitsRecordModel, ImportBatchModel

    crossing = _seed_crossing(db, nit="901000010")
    payments = PaymentService(db)
    pago = payments.create_from_crossing(crossing.id, usuario="ANDREA")
    payments.approve(pago["id"], usuario="ANDREA")
    payments.mark_paid(pago["id"], usuario="ANDREA")
    db.refresh(crossing)
    assert crossing.estado == CrossingStatus.PAGADO

    CrossingService(db).complete_row(
        crossing.id,
        factura_cdc="FV REVISION",
        fecha_pago="2099-01-01",
        observaciones="pendiente",
        usuario="ANDREA",
    )
    db.refresh(crossing)
    assert crossing.estado == CrossingStatus.PAGADO
    assert crossing.factura_cdc == "FV REVISION"
    assert crossing.fecha_pago == "2099-01-01"

    batch = ImportBatchModel(filename="sync-test.xlsx", total_rows=1, imported_rows=1)
    db.add(batch)
    db.flush()
    record = AutobitsRecordModel(
        import_batch_id=batch.id,
        row_number=1,
        proveedor=crossing.proveedor_nombre,
        nit="901000010",
        numero_compra=crossing.numero_compra,
        numero_reserva=crossing.numero_reserva,
        valor=crossing.valor_autobits,
        observaciones="pendiente",
    )
    db.add(record)
    db.flush()
    crossing.autobits_record_id = record.id
    crossing.match_type = "DESDE_AUTOBITS"
    db.commit()
    db.refresh(crossing)
    db.refresh(record)

    CrossingService(db)._sync_crossing_from_autobits(
        crossing, record, "pendiente", None
    )
    db.flush()
    db.refresh(crossing)
    assert crossing.estado == CrossingStatus.PAGADO
