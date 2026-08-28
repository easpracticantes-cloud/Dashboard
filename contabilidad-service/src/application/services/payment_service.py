"""Servicio de pagos manuales (sin Bancolombia)."""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from config.settings import get_settings
from domain.enums import CrossingStatus, DocumentStatus, PaymentStatus
from infrastructure.payments.manual_payment_provider import ManualPaymentProvider
from infrastructure.persistence.models import PaymentModel
from infrastructure.persistence.repositories import (
    AuditRepository,
    CrossingRepository,
    DocumentRepository,
    PaymentRepository,
)

settings = get_settings()
ALLOWED_RECEIPT_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}
RECEIPT_STORAGE = settings.storage_root / "pagos"


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

    def create_from_crossing(self, crossing_id: int, usuario: str = "ANDREA") -> dict:
        crossing = self.crossing_repo.get_by_id(crossing_id)
        if not crossing:
            raise PaymentServiceError("Cruce no encontrado.", "NOT_FOUND")
        if crossing.estado != CrossingStatus.APROBADO:
            raise PaymentServiceError(
                "El cruce debe estar APROBADO para generar pago.",
                "CROSSING_NOT_APPROVED",
            )
        existing = self.repo.get_by_crossing(crossing_id)
        if existing:
            raise PaymentServiceError("Ya existe un pago para este cruce.", "DUPLICATE")

        doc = crossing.document
        numero_doc = doc.numero_documento if doc else (crossing.factura_cdc or None)
        payment = self.repo.create(
            document_id=crossing.document_id,
            crossing_id=crossing.id,
            autobits_record_id=crossing.autobits_record_id,
            proveedor=crossing.proveedor_nombre,
            numero_compra=crossing.numero_compra,
            numero_reserva=crossing.numero_reserva,
            numero_documento=numero_doc,
            valor=crossing.valor_documento or crossing.valor_autobits,
        )
        if doc:
            doc.estado = DocumentStatus.PENDIENTE_PAGO

        crossing.estado = CrossingStatus.PAGADO

        self.audit.log("PAGO_CREADO", "Payment", str(payment.id), usuario=usuario)
        self.db.commit()
        self.db.refresh(payment)
        return self.to_dict(payment)

    def approve(self, payment_id: int, usuario: str = "ANDREA") -> dict:
        payment = self._get_payment_or_raise(payment_id)
        target = PaymentStatus.PENDIENTE_PAGO
        if not self.provider.can_transition(payment.estado, target):
            if payment.estado == PaymentStatus.PENDIENTE_APROBACION:
                self.repo.update_estado(payment, PaymentStatus.APROBADO, approved_by=usuario)
                target = PaymentStatus.PENDIENTE_PAGO
            else:
                raise PaymentServiceError(
                    f"No se puede aprobar desde estado {payment.estado}.",
                    "INVALID_TRANSITION",
                )

        self.repo.update_estado(payment, target, approved_by=usuario)
        if payment.document:
            payment.document.estado = DocumentStatus.PENDIENTE_PAGO

        self.audit.log("PAGO_APROBADO", "Payment", str(payment_id), usuario=usuario)
        self.db.commit()
        self.db.refresh(payment)
        return self.to_dict(payment)

    def mark_paid(self, payment_id: int, usuario: str = "ANDREA", observaciones: str | None = None) -> dict:
        """Andrea confirma que ejecutó el pago manualmente en Bancolombia."""
        payment = self._get_payment_or_raise(payment_id)
        if not self.provider.can_transition(payment.estado, PaymentStatus.PAGADO):
            raise PaymentServiceError(
                f"No se puede marcar pagado desde estado {payment.estado}.",
                "INVALID_TRANSITION",
            )

        self.repo.update_estado(
            payment,
            PaymentStatus.PAGADO,
            paid_by=usuario,
            observaciones=observaciones,
        )
        if payment.document:
            payment.document.estado = DocumentStatus.PAGADO

        self.audit.log("PAGO_EJECUTADO_MANUAL", "Payment", str(payment_id), usuario=usuario)
        self.db.commit()
        self.db.refresh(payment)
        return self.to_dict(payment)

    def upload_receipt(
        self,
        payment_id: int,
        content: bytes,
        filename: str,
        *,
        contramarcado: bool = False,
        usuario: str = "ANDREA",
    ) -> dict:
        payment = self._get_payment_or_raise(payment_id)
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

        if payment.estado == PaymentStatus.PAGADO:
            self.repo.update_estado(payment, PaymentStatus.COMPLETADO)
            if payment.document:
                payment.document.estado = DocumentStatus.COMPROBANTE_RECIBIDO
        elif payment.estado == PaymentStatus.PENDIENTE_PAGO:
            self.repo.update_estado(payment, PaymentStatus.COMPROBANTE_PENDIENTE)

        self.audit.log("COMPROBANTE_SUBIDO", "PaymentReceipt", str(receipt.id), usuario=usuario)
        self.db.commit()
        self.db.refresh(payment)
        return self.to_dict(payment, include_receipts=True)

    def complete(self, payment_id: int, usuario: str = "ANDREA") -> dict:
        payment = self._get_payment_or_raise(payment_id)
        if not payment.receipts:
            raise PaymentServiceError(
                "Se requiere comprobante antes de completar.",
                "RECEIPT_REQUIRED",
            )
        if not self.provider.can_transition(payment.estado, PaymentStatus.COMPLETADO):
            raise PaymentServiceError(
                f"No se puede completar desde estado {payment.estado}.",
                "INVALID_TRANSITION",
            )

        self.repo.update_estado(payment, PaymentStatus.COMPLETADO)
        if payment.document:
            payment.document.estado = DocumentStatus.COMPROBANTE_RECIBIDO

        self.audit.log("PAGO_COMPLETADO", "Payment", str(payment_id), usuario=usuario)
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
                str(p.valor or ""),
                p.estado,
            ]
            lines.append(",".join(f'"{c}"' if "," in c else c for c in row))
        return "\n".join(lines) + "\n"

    def _get_payment_or_raise(self, payment_id: int) -> PaymentModel:
        payment = self.repo.get_by_id(payment_id)
        if not payment:
            raise PaymentServiceError("Pago no encontrado.", "NOT_FOUND")
        return payment

    def to_dict(self, payment: PaymentModel, include_receipts: bool = False) -> dict:
        data = {
            "id": payment.id,
            "document_id": payment.document_id,
            "document_filename": payment.document.filename if payment.document else None,
            "crossing_id": payment.crossing_id,
            "autobits_record_id": payment.autobits_record_id,
            "proveedor": payment.proveedor,
            "numero_compra": payment.numero_compra,
            "numero_reserva": payment.numero_reserva,
            "numero_documento": payment.numero_documento,
            "valor": payment.valor,
            "estado": payment.estado,
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
        return data
