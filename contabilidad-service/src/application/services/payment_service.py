"""Servicio de pagos manuales (sin Bancolombia).

Invariante de la Fase 4.2: un pago solo significa dinero girado cuando Andrea
lo confirma con :meth:`PaymentService.mark_paid`. Crear o aprobar el pago deja
el cruce en APROBADO; nunca lo marca como PAGADO.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import date, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from application.services.period_service import PeriodService
from config.settings import get_settings
from domain.enums import AdjustmentAction, CrossingStatus, DocumentStatus, PaymentStatus
from domain.utils.money import money_to_float, to_money
from infrastructure.payments.manual_payment_provider import ManualPaymentProvider
from infrastructure.persistence.models import PaymentModel
from infrastructure.persistence.repositories import (
    AdjustmentRepository,
    AuditRepository,
    CrossingRepository,
    DocumentRepository,
    PaymentRepository,
)

settings = get_settings()
ALLOWED_RECEIPT_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}
RECEIPT_STORAGE = settings.storage_root / "pagos"

# Estados de documento que la anulación de un pago debe revertir.
DOC_ESTADOS_DE_PAGO = {
    DocumentStatus.PENDIENTE_PAGO,
    DocumentStatus.PAGADO,
    DocumentStatus.COMPROBANTE_RECIBIDO,
}
MOTIVO_MINIMO_PAGO_EJECUTADO = 10


class PaymentServiceError(Exception):
    def __init__(self, message: str, code: str = "PAYMENT_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code


def _sanitize_filename(name: str) -> str:
    base = Path(name).name
    return re.sub(r"[^\w.\-]", "_", base)[:200]


class PaymentService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = PaymentRepository(db)
        self.crossing_repo = CrossingRepository(db)
        self.doc_repo = DocumentRepository(db)
        self.audit = AuditRepository(db)
        self.adjustments = AdjustmentRepository(db)
        self.periods = PeriodService(db)
        self.provider = ManualPaymentProvider()

    def list_payments(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        estado: str | None = None,
        search: str | None = None,
    ) -> tuple[list[dict], int]:
        items, total = self.repo.list_payments(
            limit=limit, offset=offset, estado=estado, search=search
        )
        return [self.to_dict(p) for p in items], total

    def get_payment(self, payment_id: int) -> dict | None:
        payment = self.repo.get_by_id(payment_id)
        if not payment:
            return None
        return self.to_dict(payment, include_receipts=True)

    def create_from_crossing(self, crossing_id: int, usuario: str = "SISTEMA") -> dict:
        """Genera la orden de pago. El cruce sigue APROBADO hasta la confirmación bancaria."""
        crossing = self.crossing_repo.get_by_id(crossing_id)
        if not crossing:
            raise PaymentServiceError("Cruce no encontrado.", "NOT_FOUND")

        self.periods.ensure_period_open(
            crossing.fecha_ejecucion or crossing.created_at,
            accion="generar pagos",
        )

        if crossing.estado != CrossingStatus.APROBADO:
            raise PaymentServiceError(
                "El cruce debe estar APROBADO para generar pago.",
                "CROSSING_NOT_APPROVED",
            )
        if self.repo.get_active_by_crossing(crossing_id):
            raise PaymentServiceError("Ya existe un pago para este cruce.", "DUPLICATE")

        doc = crossing.document
        numero_doc = doc.numero_documento if doc else (crossing.factura_cdc or None)
        origen_valor = (
            crossing.valor_documento
            if crossing.valor_documento is not None
            else crossing.valor_autobits
        )
        payment = self.repo.create(
            document_id=crossing.document_id,
            crossing_id=crossing.id,
            autobits_record_id=crossing.autobits_record_id,
            proveedor=crossing.proveedor_nombre,
            numero_compra=crossing.numero_compra,
            numero_reserva=crossing.numero_reserva,
            numero_documento=numero_doc,
            valor=money_to_float(origen_valor),
        )
        if doc:
            doc.estado = DocumentStatus.PENDIENTE_PAGO

        self.audit.log(
            "PAGO_CREADO",
            "Payment",
            str(payment.id),
            valor_nuevo=f"{PaymentStatus.PENDIENTE_APROBACION} valor={payment.valor}",
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(payment)
        return self.to_dict(payment)

    def approve(self, payment_id: int, usuario: str = "SISTEMA") -> dict:
        """Aprueba el pago: queda PENDIENTE_PAGO para ejecución manual en el banco."""
        payment = self._get_payment_or_raise(payment_id)
        self.periods.ensure_period_open(
            self._period_ref(payment),
            accion="aprobar pagos",
        )
        self._assert_transition(payment.estado, PaymentStatus.PENDIENTE_PAGO, "aprobar")

        anterior = payment.estado
        self.repo.update_estado(payment, PaymentStatus.PENDIENTE_PAGO, approved_by=usuario)
        if payment.document:
            payment.document.estado = DocumentStatus.PENDIENTE_PAGO

        self.audit.log(
            "PAGO_APROBADO",
            "Payment",
            str(payment_id),
            valor_anterior=anterior,
            valor_nuevo=PaymentStatus.PENDIENTE_PAGO,
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(payment)
        return self.to_dict(payment)

    def mark_paid(
        self,
        payment_id: int,
        usuario: str = "SISTEMA",
        observaciones: str | None = None,
    ) -> dict:
        """Andrea confirma que ejecutó el pago manualmente en Bancolombia.

        Único punto donde el pago, el documento y el cruce pasan a PAGADO.
        """
        payment = self._get_payment_or_raise(payment_id)
        self.periods.ensure_period_open(
            self._period_ref(payment),
            accion="confirmar pagos bancarios",
        )
        self._assert_transition(payment.estado, PaymentStatus.PAGADO, "marcar pagado")

        anterior = payment.estado
        self.repo.update_estado(
            payment,
            PaymentStatus.PAGADO,
            paid_by=usuario,
            observaciones=observaciones,
        )
        if payment.document:
            payment.document.estado = DocumentStatus.PAGADO

        crossing = payment.crossing
        if crossing:
            crossing.estado = CrossingStatus.PAGADO
            if not (crossing.fecha_pago or "").strip():
                fecha = payment.paid_at.date() if payment.paid_at else date.today()
                crossing.fecha_pago = fecha.isoformat()

        self.audit.log(
            "PAGO_EJECUTADO_MANUAL",
            "Payment",
            str(payment_id),
            valor_anterior=anterior,
            valor_nuevo=PaymentStatus.PAGADO,
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(payment)
        return self.to_dict(payment)

    def annul(self, payment_id: int, *, motivo: str, usuario: str = "SISTEMA") -> dict:
        """Anula un pago sin borrarlo y devuelve el cruce a APROBADO.

        Permitido incluso con el período cerrado: es la vía formal de corrección.
        """
        motivo = (motivo or "").strip()
        if not motivo:
            raise PaymentServiceError(
                "Debe indicar el motivo de la anulación.",
                "MOTIVO_REQUERIDO",
            )

        payment = self._get_payment_or_raise(payment_id)
        self._assert_transition(payment.estado, PaymentStatus.ANULADO, "anular")
        if (
            self.provider.requires_strong_reason(payment.estado)
            and len(motivo) < MOTIVO_MINIMO_PAGO_EJECUTADO
        ):
            raise PaymentServiceError(
                "El pago ya fue ejecutado en banco: describa el motivo de la anulación "
                f"con al menos {MOTIVO_MINIMO_PAGO_EJECUTADO} caracteres.",
                "MOTIVO_INSUFICIENTE",
            )

        anterior = payment.estado
        valor_anterior = json.dumps(
            {"estado": anterior, "valor": payment.valor}, ensure_ascii=False
        )
        observaciones = f"{payment.observaciones or ''} | ANULADO: {motivo}".strip(" |")
        self.repo.update_estado(payment, PaymentStatus.ANULADO, observaciones=observaciones)

        crossing = payment.crossing
        if crossing and crossing.estado == CrossingStatus.PAGADO:
            crossing.estado = CrossingStatus.APROBADO
            crossing.fecha_pago = None
        if payment.document and payment.document.estado in DOC_ESTADOS_DE_PAGO:
            payment.document.estado = DocumentStatus.APROBADO

        valor_nuevo = json.dumps(
            {"estado": PaymentStatus.ANULADO, "valor": payment.valor}, ensure_ascii=False
        )
        self.adjustments.record(
            entity_type="Payment",
            entity_id=str(payment.id),
            action=AdjustmentAction.ANULACION,
            motivo=motivo,
            valor_anterior=valor_anterior,
            valor_nuevo=valor_nuevo,
            related_entity_id=str(crossing.id) if crossing else None,
            usuario=usuario,
        )
        self.audit.log(
            "PAGO_ANULADO",
            "Payment",
            str(payment_id),
            valor_anterior=valor_anterior,
            valor_nuevo=valor_nuevo,
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(payment)
        return self.to_dict(payment)

    def adjust_value(
        self,
        payment_id: int,
        *,
        valor: object,
        motivo: str,
        usuario: str = "SISTEMA",
    ) -> dict:
        """Corrige el valor de un pago dejando rastro del importe anterior."""
        motivo = (motivo or "").strip()
        if not motivo:
            raise PaymentServiceError(
                "Debe indicar el motivo del ajuste.",
                "MOTIVO_REQUERIDO",
            )

        payment = self._get_payment_or_raise(payment_id)
        if payment.estado == PaymentStatus.ANULADO:
            raise PaymentServiceError(
                "No se puede ajustar un pago anulado.",
                "INVALID_STATE",
            )

        nuevo = to_money(valor)
        if nuevo <= 0:
            raise PaymentServiceError(
                "El valor ajustado debe ser mayor que cero.",
                "INVALID_VALUE",
            )

        anterior = to_money(payment.valor)
        if anterior == nuevo:
            raise PaymentServiceError(
                "El valor ajustado es igual al actual.",
                "NO_CHANGE",
            )

        payment.valor = money_to_float(nuevo)
        self.db.flush()

        self.adjustments.record(
            entity_type="Payment",
            entity_id=str(payment.id),
            action=AdjustmentAction.AJUSTE,
            motivo=motivo,
            valor_anterior=str(anterior),
            valor_nuevo=str(nuevo),
            related_entity_id=str(payment.crossing_id) if payment.crossing_id else None,
            usuario=usuario,
        )
        self.audit.log(
            "PAGO_AJUSTADO",
            "Payment",
            str(payment_id),
            valor_anterior=str(anterior),
            valor_nuevo=str(nuevo),
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(payment)
        return self.to_dict(payment)

    def list_adjustments(self, payment_id: int) -> list[dict]:
        rows = self.adjustments.list_for_entity("Payment", str(payment_id))
        return [
            {
                "id": a.id,
                "action": a.action,
                "motivo": a.motivo,
                "valor_anterior": a.valor_anterior,
                "valor_nuevo": a.valor_nuevo,
                "related_entity_id": a.related_entity_id,
                "usuario": a.usuario,
                "created_at": a.created_at.isoformat() if a.created_at else "",
            }
            for a in rows
        ]

    def upload_receipt(
        self,
        payment_id: int,
        content: bytes,
        filename: str,
        *,
        contramarcado: bool = False,
        usuario: str = "SISTEMA",
    ) -> dict:
        payment = self._get_payment_or_raise(payment_id)
        self.periods.ensure_period_open(
            self._period_ref(payment),
            accion="cargar comprobantes de pago",
        )
        if payment.estado not in {
            PaymentStatus.PAGADO,
            PaymentStatus.COMPROBANTE_PENDIENTE,
            PaymentStatus.PENDIENTE_PAGO,
        }:
            raise PaymentServiceError(
                "El pago debe estar al menos pendiente de pago o pagado.",
                "INVALID_STATE",
            )

        safe_name = _sanitize_filename(filename)
        ext = Path(safe_name).suffix.lower()
        if ext not in ALLOWED_RECEIPT_EXTENSIONS:
            raise PaymentServiceError(
                f"Extension no permitida: {ext}. Use jpg, jpeg, png o pdf.",
                "INVALID_EXTENSION",
            )

        max_bytes = settings.max_upload_mb * 1024 * 1024
        if len(content) > max_bytes:
            raise PaymentServiceError(
                f"Archivo supera el limite de {settings.max_upload_mb} MB.",
                "FILE_TOO_LARGE",
            )

        now = datetime.now()
        dest_dir = RECEIPT_STORAGE / str(now.year) / f"{now.month:02d}"
        dest_dir.mkdir(parents=True, exist_ok=True)
        unique_name = f"{uuid.uuid4().hex[:8]}_{safe_name}"
        dest_path = dest_dir / unique_name
        dest_path.write_bytes(content)

        file_hash = hashlib.sha256(content).hexdigest()
        receipt = self.repo.add_receipt(
            payment,
            filename=safe_name,
            storage_path=str(dest_path),
            file_hash=file_hash,
            uploaded_by=usuario,
            contramarcado=contramarcado,
        )

        # Adjuntar el comprobante nunca da por pagado un giro sin confirmar:
        # eso solo ocurre en mark_paid.
        if payment.estado in {PaymentStatus.PAGADO, PaymentStatus.COMPROBANTE_PENDIENTE}:
            self.repo.update_estado(payment, PaymentStatus.COMPLETADO)
            if payment.document:
                payment.document.estado = DocumentStatus.COMPROBANTE_RECIBIDO

        self.audit.log(
            "COMPROBANTE_SUBIDO",
            "PaymentReceipt",
            str(receipt.id),
            valor_nuevo=f"payment={payment.id} estado={payment.estado}",
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(payment)
        return self.to_dict(payment, include_receipts=True)

    def complete(self, payment_id: int, usuario: str = "SISTEMA") -> dict:
        payment = self._get_payment_or_raise(payment_id)
        self.periods.ensure_period_open(
            self._period_ref(payment),
            accion="completar pagos",
        )
        if not payment.receipts:
            raise PaymentServiceError(
                "Se requiere comprobante antes de completar.",
                "RECEIPT_REQUIRED",
            )
        self._assert_transition(payment.estado, PaymentStatus.COMPLETADO, "completar")

        anterior = payment.estado
        self.repo.update_estado(payment, PaymentStatus.COMPLETADO)
        if payment.document:
            payment.document.estado = DocumentStatus.COMPROBANTE_RECIBIDO

        self.audit.log(
            "PAGO_COMPLETADO",
            "Payment",
            str(payment_id),
            valor_anterior=anterior,
            valor_nuevo=PaymentStatus.COMPLETADO,
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(payment)
        return self.to_dict(payment)

    def export_pending_csv(self) -> str:
        pending = self.repo.list_pending_execution()
        headers = [
            "id",
            "proveedor",
            "numero_compra",
            "numero_reserva",
            "numero_documento",
            "valor",
            "estado",
        ]
        lines = [",".join(headers)]
        for p in pending:
            row = [
                str(p.id),
                p.proveedor or "",
                p.numero_compra or "",
                p.numero_reserva or "",
                p.numero_documento or "",
                str(to_money(p.valor)) if p.valor is not None else "",
                p.estado,
            ]
            lines.append(",".join(f'"{c}"' if "," in c else c for c in row))
        return "\n".join(lines) + "\n"

    def _assert_transition(self, actual: str, destino: str, accion: str) -> None:
        if not self.provider.can_transition(actual, destino):
            raise PaymentServiceError(
                f"No se puede {accion} desde estado {actual}.",
                "INVALID_TRANSITION",
            )

    def _get_payment_or_raise(self, payment_id: int) -> PaymentModel:
        payment = self.repo.get_by_id(payment_id)
        if not payment:
            raise PaymentServiceError("Pago no encontrado.", "NOT_FOUND")
        return payment

    def _period_ref(self, payment: PaymentModel):
        """Fecha de la semana operativa del pago (cruce → creación)."""
        crossing = payment.crossing
        if crossing is not None:
            if (crossing.fecha_ejecucion or "").strip():
                return crossing.fecha_ejecucion
            if crossing.created_at is not None:
                return crossing.created_at
        if payment.document is not None and payment.document.received_at is not None:
            return payment.document.received_at
        return payment.created_at

    def to_dict(self, payment: PaymentModel, include_receipts: bool = False) -> dict:
        data = {
            "id": payment.id,
            "document_id": payment.document_id,
            "document_filename": payment.document.filename if payment.document else None,
            "crossing_id": payment.crossing_id,
            "crossing_estado": payment.crossing.estado if payment.crossing else None,
            "autobits_record_id": payment.autobits_record_id,
            "proveedor": payment.proveedor,
            "numero_compra": payment.numero_compra,
            "numero_reserva": payment.numero_reserva,
            "numero_documento": payment.numero_documento,
            "valor": payment.valor,
            "estado": payment.estado,
            "anulado": payment.estado == PaymentStatus.ANULADO,
            "observaciones": payment.observaciones,
            "approved_by": payment.approved_by,
            "approved_at": payment.approved_at.isoformat() if payment.approved_at else None,
            "paid_by": payment.paid_by,
            "paid_at": payment.paid_at.isoformat() if payment.paid_at else None,
            "has_receipt": bool(payment.receipts),
            "created_at": payment.created_at.isoformat() if payment.created_at else "",
        }
        if include_receipts:
            data["receipts"] = [
                {
                    "id": r.id,
                    "filename": r.filename,
                    "contramarcado": r.contramarcado,
                    "uploaded_by": r.uploaded_by,
                    "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else "",
                    "preview_url": f"/api/payments/{payment.id}/receipts/{r.id}/preview",
                }
                for r in payment.receipts
            ]
            data["adjustments"] = self.list_adjustments(payment.id)
        return data
