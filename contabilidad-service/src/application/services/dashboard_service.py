"""Servicio de KPIs del dashboard."""

from __future__ import annotations

from sqlalchemy.orm import Session

from domain.enums import (
    CrossingStatus,
    DocumentStatus,
    PackageStatus,
    PaymentStatus,
    RemediationStatus,
)
from domain.utils.money import money_sum, money_to_float
from domain.utils.period_utils import recent_weeks, resolve_period
from infrastructure.persistence.models import (
    AccountCrossingModel,
    DigitalPackageModel,
    DocumentModel,
    PaymentModel,
    ProviderModel,
    RemediationModel,
)


class DashboardService:
    PROCESSED_STATES = {
        DocumentStatus.EXTRAIDO,
        DocumentStatus.PROCESADO,
        DocumentStatus.VALIDANDO,
        DocumentStatus.CRUZANDO,
        DocumentStatus.APROBADO,
        DocumentStatus.PENDIENTE_PAGO,
        DocumentStatus.PAGADO,
        DocumentStatus.COMPROBANTE_RECIBIDO,
        DocumentStatus.FINALIZADO,
        DocumentStatus.PAQUETE_DIGITAL,
    }

    def __init__(self, db: Session):
        self.db = db

    def get_weeks(self, count: int = 8) -> list[dict]:
        return recent_weeks(count)

    def get_kpis(
        self,
        *,
        period_start: str | None = None,
        period_end: str | None = None,
        week_ref: str | None = None,
        mes: int | None = None,
        anio: int | None = None,
        proveedor: str | None = None,
        estado: str | None = None,
        tipo: str | None = None,
    ) -> dict:
        start, end, label = resolve_period(
            period_start=period_start,
            period_end=period_end,
            week_ref=week_ref,
            mes=mes,
            anio=anio,
        )

        docs_q = self.db.query(DocumentModel).filter(
            DocumentModel.received_at >= start,
            DocumentModel.received_at <= end,
        )
        if estado:
            docs_q = docs_q.filter(DocumentModel.estado == estado)
        if tipo:
            docs_q = docs_q.filter(DocumentModel.tipo == tipo.upper())
        if proveedor:
            docs_q = docs_q.join(ProviderModel).filter(ProviderModel.nombre.ilike(f"%{proveedor}%"))

        docs = docs_q.all()
        doc_ids = [d.id for d in docs]

        # Sin documentos en el período (o tras aplicar filtros) las entidades
        # relacionadas también quedan vacías: devolver todo el período daría KPIs
        # que no corresponden al filtro aplicado.
        if doc_ids:
            remediations = (
                self.db.query(RemediationModel)
                .filter(
                    RemediationModel.created_at >= start,
                    RemediationModel.created_at <= end,
                    RemediationModel.document_id.in_(doc_ids),
                )
                .all()
            )
            payments = (
                self.db.query(PaymentModel)
                .filter(
                    PaymentModel.created_at >= start,
                    PaymentModel.created_at <= end,
                    PaymentModel.document_id.in_(doc_ids),
                )
                .all()
            )
            packages = (
                self.db.query(DigitalPackageModel)
                .filter(
                    DigitalPackageModel.created_at >= start,
                    DigitalPackageModel.created_at <= end,
                    DigitalPackageModel.document_id.in_(doc_ids),
                )
                .all()
            )
            crossings = (
                self.db.query(AccountCrossingModel)
                .filter(
                    AccountCrossingModel.created_at >= start,
                    AccountCrossingModel.created_at <= end,
                    AccountCrossingModel.document_id.in_(doc_ids),
                )
                .all()
            )
        else:
            remediations = []
            payments = []
            packages = []
            crossings = []

        valor_docs = money_sum(d.total for d in docs)
        valor_aprobado = money_sum(
            d.total for d in docs if d.estado == DocumentStatus.APROBADO
        )
        valor_pendiente = money_sum(
            p.valor for p in payments if p.estado == PaymentStatus.PENDIENTE_PAGO
        )
        valor_pagado = money_sum(
            p.valor
            for p in payments
            if p.estado in {PaymentStatus.PAGADO, PaymentStatus.COMPLETADO}
        )
        valor_subsanar = money_sum(
            r.valor_involucrado
            for r in remediations
            if r.estado in {RemediationStatus.PENDIENTE, RemediationStatus.EN_PROCESO}
        )

        return {
            "periodo": {
                "inicio": start.date().isoformat(),
                "fin": end.date().isoformat(),
                "etiqueta": label,
            },
            "conteos": {
                "documentos_recibidos": len(docs),
                "documentos_procesados": sum(1 for d in docs if d.estado in self.PROCESSED_STATES),
                "pendientes_revision": sum(1 for d in docs if d.estado == DocumentStatus.REQUIERE_REVISION),
                "aprobados": sum(1 for d in docs if d.estado == DocumentStatus.APROBADO),
                "subsanaciones_pendientes": sum(
                    1
                    for r in remediations
                    if r.estado in {RemediationStatus.PENDIENTE, RemediationStatus.EN_PROCESO}
                ),
                "pagos_pendientes": sum(
                    1
                    for p in payments
                    if p.estado in {PaymentStatus.PENDIENTE_APROBACION, PaymentStatus.PENDIENTE_PAGO}
                ),
                "pagos_realizados": sum(
                    1
                    for p in payments
                    if p.estado in {PaymentStatus.PAGADO, PaymentStatus.COMPLETADO}
                ),
                "paquetes_pendientes": sum(1 for pk in packages if pk.estado != PackageStatus.CERRADO),
                "cruces_aprobados": sum(1 for c in crossings if c.estado == CrossingStatus.APROBADO),
            },
            "totales": {
                "valor_documentos": money_to_float(valor_docs),
                "valor_aprobado": money_to_float(valor_aprobado),
                "valor_pendiente_pago": money_to_float(valor_pendiente),
                "valor_pagado": money_to_float(valor_pagado),
                "valor_por_subsanar": money_to_float(valor_subsanar),
            },
        }
