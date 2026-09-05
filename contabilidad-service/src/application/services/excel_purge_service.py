"""Purge de Excels Autobits/Cruce, facturas importadas y datos derivados."""

from __future__ import annotations

import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from config.settings import get_settings
from infrastructure.persistence.models import (
    AccountCrossingModel,
    AutobitsRecordModel,
    DigitalPackageModel,
    DocumentModel,
    ImportBatchModel,
    PaymentModel,
    PaymentReceiptModel,
    ProcessingJobModel,
    PurchaseModel,
    RemediationModel,
    ReservationModel,
)
from infrastructure.persistence.repositories import AuditRepository


class ExcelPurgeService:
    def __init__(self, db: Session):
        self.db = db
        self.audit = AuditRepository(db)
        self.settings = get_settings()

    def purge_all(self, *, usuario: str = "SISTEMA", confirm: bool = False) -> dict:
        if not confirm:
            raise ValueError("Debe confirmar con confirm=true para limpiar los Excels.")

        batches = self.db.query(ImportBatchModel).all()
        batch_ids = [b.id for b in batches]
        storage_paths = [Path(b.storage_path) for b in batches if b.storage_path]

        record_ids = []
        if batch_ids:
            record_ids = [
                r.id
                for r in self.db.query(AutobitsRecordModel.id)
                .filter(AutobitsRecordModel.import_batch_id.in_(batch_ids))
                .all()
            ]

        crossing_q = self.db.query(AccountCrossingModel)
        if batch_ids or record_ids:
            from sqlalchemy import or_

            filters = []
            if batch_ids:
                filters.append(AccountCrossingModel.import_batch_id.in_(batch_ids))
            if record_ids:
                filters.append(AccountCrossingModel.autobits_record_id.in_(record_ids))
            crossings = crossing_q.filter(or_(*filters)).all() if filters else []
        else:
            # Sin lotes: limpia cruces huérfanos ligados a Autobits
            crossings = crossing_q.filter(AccountCrossingModel.autobits_record_id.isnot(None)).all()

        crossing_ids = [c.id for c in crossings]

        deleted = {
            "batches": 0,
            "records": 0,
            "purchases": 0,
            "reservations": 0,
            "crossings": 0,
            "payments": 0,
            "receipts": 0,
            "remediations": 0,
            "files": 0,
        }

        if crossing_ids:
            payment_ids = [
                p.id
                for p in self.db.query(PaymentModel.id)
                .filter(PaymentModel.crossing_id.in_(crossing_ids))
                .all()
            ]
            if payment_ids:
                deleted["receipts"] = (
                    self.db.query(PaymentReceiptModel)
                    .filter(PaymentReceiptModel.payment_id.in_(payment_ids))
                    .delete(synchronize_session=False)
                )
                deleted["payments"] = (
                    self.db.query(PaymentModel)
                    .filter(PaymentModel.id.in_(payment_ids))
                    .delete(synchronize_session=False)
                )
            deleted["remediations"] = (
                self.db.query(RemediationModel)
                .filter(RemediationModel.crossing_id.in_(crossing_ids))
                .delete(synchronize_session=False)
            )
            deleted["crossings"] = (
                self.db.query(AccountCrossingModel)
                .filter(AccountCrossingModel.id.in_(crossing_ids))
                .delete(synchronize_session=False)
            )

        if record_ids:
            deleted["purchases"] = (
                self.db.query(PurchaseModel)
                .filter(PurchaseModel.autobits_record_id.in_(record_ids))
                .delete(synchronize_session=False)
            )
            deleted["reservations"] = (
                self.db.query(ReservationModel)
                .filter(ReservationModel.autobits_record_id.in_(record_ids))
                .delete(synchronize_session=False)
            )
            # Pagos ligados directo a records Autobits
            extra_pay = (
                self.db.query(PaymentModel)
                .filter(PaymentModel.autobits_record_id.in_(record_ids))
                .all()
            )
            extra_ids = [p.id for p in extra_pay]
            if extra_ids:
                deleted["receipts"] += (
                    self.db.query(PaymentReceiptModel)
                    .filter(PaymentReceiptModel.payment_id.in_(extra_ids))
                    .delete(synchronize_session=False)
                )
                deleted["payments"] += (
                    self.db.query(PaymentModel)
                    .filter(PaymentModel.id.in_(extra_ids))
                    .delete(synchronize_session=False)
                )
            deleted["records"] = (
                self.db.query(AutobitsRecordModel)
                .filter(AutobitsRecordModel.id.in_(record_ids))
                .delete(synchronize_session=False)
            )

        if batch_ids:
            deleted["batches"] = (
                self.db.query(ImportBatchModel)
                .filter(ImportBatchModel.id.in_(batch_ids))
                .delete(synchronize_session=False)
            )

        deleted["files"] = self._wipe_disk(storage_paths)
        docs = self.purge_documents(commit=False)
        deleted["documents"] = docs.get("documents", 0)
        deleted["jobs"] = docs.get("jobs", 0)
        deleted["packages"] = docs.get("packages", 0)
        deleted["files"] += docs.get("files", 0)

        self.audit.log(
            "PURGE_EXCELS",
            "ImportBatch",
            "ALL",
            valor_nuevo=str(deleted),
            usuario=usuario,
        )
        self.db.commit()
        return {"ok": True, "deleted": deleted}

    def purge_documents(self, *, commit: bool = True) -> dict:
        """Borra facturas importadas y sus archivos. Deja cruces sin document_id."""
        deleted = {"documents": 0, "jobs": 0, "packages": 0, "files": 0}
        docs = self.db.query(DocumentModel).all()
        if not docs:
            if commit:
                self.db.commit()
            return deleted

        doc_ids = [d.id for d in docs]
        paths = [Path(d.storage_path) for d in docs if d.storage_path]

        deleted["jobs"] = (
            self.db.query(ProcessingJobModel)
            .filter(ProcessingJobModel.document_id.in_(doc_ids))
            .delete(synchronize_session=False)
        )
        self.db.query(AccountCrossingModel).filter(
            AccountCrossingModel.document_id.in_(doc_ids)
        ).update({AccountCrossingModel.document_id: None}, synchronize_session=False)
        self.db.query(RemediationModel).filter(
            RemediationModel.document_id.in_(doc_ids)
        ).delete(synchronize_session=False)
        deleted["packages"] = (
            self.db.query(DigitalPackageModel)
            .filter(DigitalPackageModel.document_id.in_(doc_ids))
            .delete(synchronize_session=False)
        )
        pay_ids = [
            p.id
            for p in self.db.query(PaymentModel.id)
            .filter(PaymentModel.document_id.in_(doc_ids))
            .all()
        ]
        if pay_ids:
            self.db.query(PaymentReceiptModel).filter(
                PaymentReceiptModel.payment_id.in_(pay_ids)
            ).delete(synchronize_session=False)
            self.db.query(PaymentModel).filter(PaymentModel.id.in_(pay_ids)).delete(
                synchronize_session=False
            )
        deleted["documents"] = (
            self.db.query(DocumentModel)
            .filter(DocumentModel.id.in_(doc_ids))
            .delete(synchronize_session=False)
        )
        for p in paths:
            try:
                if p.exists() and p.is_file():
                    p.unlink()
                    deleted["files"] += 1
            except OSError:
                pass
        if commit:
            self.db.commit()
        return deleted

    def _wipe_disk(self, batch_paths: list[Path]) -> int:
        removed = 0
        root = Path(self.settings.storage_root)
        for p in batch_paths:
            try:
                if p.exists() and p.is_file():
                    p.unlink()
                    removed += 1
            except OSError:
                pass

        for rel in ("autobits/imports", "autobits/previews", "cruce/imports", "cruce/compare"):
            folder = root / rel
            if not folder.exists():
                continue
            for child in folder.rglob("*"):
                if child.is_file():
                    try:
                        child.unlink()
                        removed += 1
                    except OSError:
                        pass
            # limpia dirs vacíos bajo imports
            if rel.endswith("imports") or rel.endswith("previews"):
                try:
                    shutil.rmtree(folder, ignore_errors=True)
                    folder.mkdir(parents=True, exist_ok=True)
                except OSError:
                    pass
            else:
                folder.mkdir(parents=True, exist_ok=True)
        return removed
