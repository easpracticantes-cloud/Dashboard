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

        remediations_q = self.db.query(RemediationModel).filter(
            RemediationModel.created_at >= start,
            RemediationModel.created_at <= end,
        )
        if doc_ids:
            remediations_q = remediations_q.filter(RemediationModel.document_id.in_(doc_ids))
        remediations = remediations_q.all()

        payments_q = self.db.query(PaymentModel).filter(
            PaymentModel.created_at >= start,
            PaymentModel.created_at <= end,
        )
        if doc_ids:
            payments_q = payments_q.filter(PaymentModel.document_id.in_(doc_ids))
        payments = payments_q.all()

        packages_q = self.db.query(DigitalPackageModel).filter(
            DigitalPackageModel.created_at >= start,
            DigitalPackageModel.created_at <= end,
        )
        if doc_ids:
            packages_q = packages_q.filter(DigitalPackageModel.document_id.in_(doc_ids))
        packages = packages_q.all()

        crossings_q = self.db.query(AccountCrossingModel).filter(
            AccountCrossingModel.created_at >= start,
            AccountCrossingModel.created_at <= end,
        )
        if doc_ids:
            crossings_q = crossings_q.filter(AccountCrossingModel.document_id.in_(doc_ids))
        crossings = crossings_q.all()

        valor_docs = sum(d.total or 0 for d in docs)
        valor_aprobado = sum(d.total or 0 for d in docs if d.estado == DocumentStatus.APROBADO)
        valor_pendiente = sum(
            p.valor or 0 for p in payments if p.estado == PaymentStatus.PENDIENTE_PAGO
        )
        valor_pagado = sum(
            p.valor or 0
            for p in payments
            if p.estado in {PaymentStatus.PAGADO, PaymentStatus.COMPLETADO}
        )
        valor_subsanar = sum(
            r.valor_involucrado or 0
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
                "valor_documentos": round(valor_docs, 2),
                "valor_aprobado": round(valor_aprobado, 2),
                "valor_pendiente_pago": round(valor_pendiente, 2),
                "valor_pagado": round(valor_pagado, 2),
                "valor_por_subsanar": round(valor_subsanar, 2),
            },
        }
