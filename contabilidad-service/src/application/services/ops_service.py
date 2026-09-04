"""Trazabilidad y cola operativa del ciclo de cuentas por pagar — Fase 4.5/4.6.

Cadena AP: Autobits → Factura → Cruce → Pago → Comprobante → Paquete.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from domain.enums import (
    PAGOS_SIN_CONFIRMACION_BANCARIA,
    CrossingStatus,
    DocumentStatus,
    PaymentStatus,
    RemediationStatus,
)
from domain.utils.money import money_sum, money_to_float
from domain.utils.period_utils import resolve_period
from infrastructure.persistence.models import (
    AccountCrossingModel,
    AutobitsRecordModel,
    DigitalPackageModel,
    DocumentModel,
    PaymentModel,
    RemediationModel,
)

CRUCES_INCOMPLETOS = (CrossingStatus.PENDIENTE, CrossingStatus.EN_REVISION)
SUBSANACIONES_ABIERTAS = (RemediationStatus.PENDIENTE, RemediationStatus.EN_PROCESO)
ESLABONES = ("autobits", "crossing", "payment", "receipt", "package")


class OpsService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------- cadena

    def get_chain(self, document_id: int) -> dict | None:
        """Cadena documental completa de una factura, con los eslabones faltantes."""
        doc = self.db.get(DocumentModel, document_id)
        if not doc:
            return None

        crossing = self._crossing_for_document(doc)
        record = self._autobits_for(crossing)
        payment = self._payment_for(doc, crossing)
        package = self._package_for(doc)
        tiene_comprobante = bool(payment and payment.receipts)

        presentes = {
            "autobits": record is not None,
            "crossing": crossing is not None,
            "payment": payment is not None,
            "receipt": tiene_comprobante,
            "package": package is not None,
        }
        faltantes = [nombre for nombre in ESLABONES if not presentes[nombre]]

        return {
            "document": self._document_dict(doc),
            "autobits": self._autobits_dict(record),
            "crossing": self._crossing_dict(crossing),
            "payment": self._payment_dict(payment),
            "receipt": tiene_comprobante,
            "receipts": self._receipts_dict(payment),
            "package": self._package_dict(package),
            "missing_links": faltantes,
            "status": "COMPLETA" if not faltantes else "INCOMPLETA",
        }

    # -------------------------------------------------------------------- cola

    def get_queue(self, **period_kwargs) -> dict:
        """Trabajo pendiente del período, agrupado por tipo."""
        inicio, fin, etiqueta = resolve_period(**period_kwargs)

        pagos_sin_banco = (
            self.db.query(PaymentModel)
            .filter(
                PaymentModel.created_at >= inicio,
                PaymentModel.created_at <= fin,
                PaymentModel.estado.in_(tuple(PAGOS_SIN_CONFIRMACION_BANCARIA)),
            )
            .order_by(PaymentModel.created_at.asc())
            .all()
        )

        cruces_incompletos = (
            self.db.query(AccountCrossingModel)
            .filter(
                AccountCrossingModel.created_at >= inicio,
                AccountCrossingModel.created_at <= fin,
                AccountCrossingModel.estado.in_(CRUCES_INCOMPLETOS),
            )
            .order_by(AccountCrossingModel.created_at.asc())
            .all()
        )

        duplicados = (
            self.db.query(DocumentModel)
            .filter(
                DocumentModel.received_at >= inicio,
                DocumentModel.received_at <= fin,
                DocumentModel.estado == DocumentStatus.DUPLICADO,
            )
            .order_by(DocumentModel.received_at.asc())
            .all()
        )

        subsanaciones = (
            self.db.query(RemediationModel)
            .filter(
                RemediationModel.created_at >= inicio,
                RemediationModel.created_at <= fin,
                RemediationModel.estado.in_(SUBSANACIONES_ABIERTAS),
            )
            .order_by(RemediationModel.created_at.asc())
            .all()
        )

        pagados = (
            self.db.query(PaymentModel)
            .filter(
                PaymentModel.created_at >= inicio,
                PaymentModel.created_at <= fin,
                PaymentModel.estado.in_(
                    (PaymentStatus.PAGADO, PaymentStatus.COMPROBANTE_PENDIENTE)
                ),
            )
            .order_by(PaymentModel.created_at.asc())
            .all()
        )
        sin_comprobante = [p for p in pagados if not p.receipts]

        grupos = {
            "pagos_sin_confirmacion_bancaria": [self._payment_dict(p) for p in pagos_sin_banco],
            "cruces_incompletos": [self._crossing_dict(c) for c in cruces_incompletos],
            "documentos_duplicados": [self._document_dict(d) for d in duplicados],
            "subsanaciones_abiertas": [self._remediation_dict(r) for r in subsanaciones],
            "comprobantes_faltantes": [self._payment_dict(p) for p in sin_comprobante],
        }

        return {
            "periodo": {
                "inicio": inicio.date().isoformat(),
                "fin": fin.date().isoformat(),
                "etiqueta": etiqueta,
            },
            "conteos": {clave: len(items) for clave, items in grupos.items()},
            "total_pendientes": sum(len(items) for items in grupos.values()),
            "totales": {
                "valor_sin_confirmacion_bancaria": money_to_float(
                    money_sum(p.valor for p in pagos_sin_banco)
                ),
                "valor_sin_comprobante": money_to_float(
                    money_sum(p.valor for p in sin_comprobante)
                ),
            },
            "items": grupos,
        }

    # ------------------------------------------------------------------ alertas

    def get_alerts(self, **period_kwargs) -> dict:
        """Misma información que la cola, priorizada para el tablero."""
        queue = self.get_queue(**period_kwargs)
        conteos = queue["conteos"]

        definiciones = (
            (
                "pagos_sin_confirmacion_bancaria",
                "CRITICA",
                "Pagos generados sin confirmación bancaria",
                "Confirme la transferencia en Bancolombia y marque el pago como PAGADO.",
            ),
            (
                "comprobantes_faltantes",
                "CRITICA",
                "Pagos ejecutados sin comprobante",
                "Suba el comprobante contramarcado del pago.",
            ),
            (
                "documentos_duplicados",
                "ALTA",
                "Documentos marcados como duplicados",
                "Revise y descarte el duplicado antes de cerrar la semana.",
            ),
            (
                "cruces_incompletos",
                "MEDIA",
                "Cruces pendientes o en revisión",
                "Complete FACTURA/CDC y fecha de pago del cruce.",
            ),
            (
                "subsanaciones_abiertas",
                "MEDIA",
                "Subsanaciones abiertas",
                "Gestione la subsanación con el proveedor.",
            ),
        )

        alertas = [
            {
                "codigo": codigo,
                "severidad": severidad,
                "titulo": titulo,
                "accion_sugerida": accion,
                "cantidad": conteos.get(codigo, 0),
                "items": queue["items"].get(codigo, []),
            }
            for codigo, severidad, titulo, accion in definiciones
            if conteos.get(codigo, 0) > 0
        ]

        return {
            "periodo": queue["periodo"],
            "total_alertas": len(alertas),
            "total_items": queue["total_pendientes"],
            "alertas": alertas,
        }

    # ----------------------------------------------------------------- internos

    def _crossing_for_document(self, doc: DocumentModel) -> AccountCrossingModel | None:
        vigentes = [c for c in doc.crossings if c.estado != CrossingStatus.ARCHIVADO]
        candidatos = vigentes or list(doc.crossings)
        if not candidatos:
            return None
        return max(candidatos, key=lambda c: c.id)

    def _autobits_for(self, crossing: AccountCrossingModel | None) -> AutobitsRecordModel | None:
        if not crossing or not crossing.autobits_record_id:
            return None
        return self.db.get(AutobitsRecordModel, crossing.autobits_record_id)

    def _payment_for(
        self,
        doc: DocumentModel,
        crossing: AccountCrossingModel | None,
    ) -> PaymentModel | None:
        candidatos = list(doc.payments)
        if crossing:
            candidatos += [p for p in crossing.payments if p not in candidatos]
        vigentes = [p for p in candidatos if p.estado != PaymentStatus.ANULADO]
        elegibles = vigentes or candidatos
        if not elegibles:
            return None
        return max(elegibles, key=lambda p: p.id)

    def _package_for(self, doc: DocumentModel) -> DigitalPackageModel | None:
        packages = list(doc.packages or [])
        if not packages:
            return None
        return max(packages, key=lambda p: p.id)

    def _document_dict(self, doc: DocumentModel | None) -> dict | None:
        if not doc:
            return None
        return {
            "id": doc.id,
            "filename": doc.filename,
            "tipo": doc.tipo,
            "origen": doc.origen,
            "estado": doc.estado,
            "proveedor": doc.provider.nombre if doc.provider else None,
            "nit": doc.provider.nit if doc.provider else None,
            "numero_documento": doc.numero_documento,
            "total": doc.total,
            "received_at": doc.received_at.isoformat() if doc.received_at else "",
        }

    def _autobits_dict(self, record: AutobitsRecordModel | None) -> dict | None:
        if not record:
            return None
        return {
            "id": record.id,
            "import_batch_id": record.import_batch_id,
            "proveedor": record.proveedor,
            "nit": record.nit,
            "numero_compra": record.numero_compra,
            "numero_reserva": record.numero_reserva,
            "numero_documento": record.numero_documento,
            "valor": record.valor,
            "fecha": record.fecha,
            "estado": record.estado,
            "observaciones": record.observaciones,
        }

    def _crossing_dict(self, crossing: AccountCrossingModel | None) -> dict | None:
        if not crossing:
            return None
        return {
            "id": crossing.id,
            "document_id": crossing.document_id,
            "autobits_record_id": crossing.autobits_record_id,
            "estado": crossing.estado,
            "match_type": crossing.match_type,
            "proveedor": crossing.proveedor_nombre,
            "numero_compra": crossing.numero_compra,
            "numero_reserva": crossing.numero_reserva,
            "valor_documento": crossing.valor_documento,
            "valor_autobits": crossing.valor_autobits,
            "diferencia": crossing.diferencia,
            "factura_cdc": crossing.factura_cdc,
            "fecha_pago": crossing.fecha_pago,
            "created_at": crossing.created_at.isoformat() if crossing.created_at else "",
        }

    def _payment_dict(self, payment: PaymentModel | None) -> dict | None:
        if not payment:
            return None
        return {
            "id": payment.id,
            "document_id": payment.document_id,
            "crossing_id": payment.crossing_id,
            "proveedor": payment.proveedor,
            "numero_compra": payment.numero_compra,
            "numero_reserva": payment.numero_reserva,
            "numero_documento": payment.numero_documento,
            "valor": payment.valor,
            "estado": payment.estado,
            "has_receipt": bool(payment.receipts),
            "paid_at": payment.paid_at.isoformat() if payment.paid_at else None,
            "created_at": payment.created_at.isoformat() if payment.created_at else "",
        }

    def _receipts_dict(self, payment: PaymentModel | None) -> list[dict]:
        if not payment:
            return []
        return [
            {
                "id": r.id,
                "filename": r.filename,
                "contramarcado": r.contramarcado,
                "uploaded_by": r.uploaded_by,
                "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else "",
            }
            for r in payment.receipts
        ]

    def _package_dict(self, package: DigitalPackageModel | None) -> dict | None:
        if not package:
            return None
        return {
            "id": package.id,
            "document_id": package.document_id,
            "payment_id": package.payment_id,
            "crossing_id": package.crossing_id,
            "estado": package.estado,
            "responsable": package.responsable,
            "generated_at": package.generated_at.isoformat() if package.generated_at else None,
            "created_at": package.created_at.isoformat() if package.created_at else "",
        }

    def _remediation_dict(self, remediation: RemediationModel) -> dict:
        return {
            "id": remediation.id,
            "document_id": remediation.document_id,
            "crossing_id": remediation.crossing_id,
            "proveedor": remediation.proveedor,
            "tipo_problema": remediation.tipo_problema,
            "descripcion": remediation.descripcion,
            "valor_involucrado": remediation.valor_involucrado,
            "responsable": remediation.responsable,
            "estado": remediation.estado,
            "created_at": remediation.created_at.isoformat() if remediation.created_at else "",
        }
