"""Repositorios de persistencia."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from domain.enums import (
    AdjustmentAction,
    AutobitsRecordStatus,
    CrossingStatus,
    DocumentStatus,
    ImportBatchStatus,
    MatchType,
    PackageStatus,
    PaymentStatus,
    PeriodClosureStatus,
    ProcessingJobStatus,
    RemediationStatus,
)
from infrastructure.persistence.models import (
    AccountCrossingModel,
    AccountingAdjustmentModel,
    AuditLogModel,
    AutobitsRecordModel,
    DigitalPackageModel,
    DocumentModel,
    ImportBatchModel,
    PaymentModel,
    PaymentReceiptModel,
    PeriodClosureModel,
    ProcessingJobModel,
    ProviderModel,
    PurchaseModel,
    RemediationModel,
    ReservationModel,
)


def file_hash(path: Path) -> str:
    """SHA256 del archivo."""
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


class DocumentRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, doc_id: int) -> DocumentModel | None:
        return self.db.get(DocumentModel, doc_id)

    def find_duplicate(self, file_hash_value: str, nit: str | None, numero: str | None) -> DocumentModel | None:
        q = self.db.query(DocumentModel).filter(DocumentModel.file_hash == file_hash_value)
        if nit and numero:
            dup = q.filter(
                DocumentModel.numero_documento == numero,
            ).first()
            if dup:
                return dup
        return q.first()

    def create_from_file(
        self,
        path: Path,
        origen: str,
        storage_path: str | None = None,
        filename: str | None = None,
    ) -> DocumentModel:
        doc = DocumentModel(
            filename=filename or path.name,
            file_hash=file_hash(path),
            storage_path=storage_path or str(path),
            origen=origen,
            estado=DocumentStatus.RECIBIDO,
        )
        self.db.add(doc)
        self.db.flush()
        return doc

    def update_extraction(
        self,
        doc: DocumentModel,
        *,
        extracted: dict,
        ocr_text: str,
        metodo_ocr: str,
        estado: str,
        requiere_revision: bool,
        observaciones: str | None,
        confidence_global: float | None = None,
    ) -> DocumentModel:
        proveedor = extracted.get("proveedor")
        if isinstance(proveedor, dict):
            nombre = proveedor.get("nombre")
            nit = proveedor.get("nit")
        else:
            nombre = extracted.get("proveedor") or proveedor
            nit = extracted.get("nit_o_identificacion")

        documento = extracted.get("documento") or {}
        valores = extracted.get("valores") or {}

        doc.numero_documento = (
            documento.get("numero")
            or extracted.get("numero_factura")
            or doc.numero_documento
        )
        doc.fecha_emision = documento.get("fecha_emision") or extracted.get("fecha_emision")
        doc.subtotal = _to_float(valores.get("subtotal") or extracted.get("subtotal"))
        doc.iva = _to_float(valores.get("iva") or extracted.get("impuesto"))
        doc.total = _to_float(valores.get("total") or extracted.get("total"))
        doc.moneda = extracted.get("moneda")
        doc.concepto = extracted.get("concepto") or extracted.get("concepto_general")
        doc.tipo = (extracted.get("tipo_documento") or "FACTURA").upper()
        doc.extracted_json = json.dumps(extracted, ensure_ascii=False)
        doc.ocr_text = ocr_text
        doc.metodo_ocr = metodo_ocr
        doc.estado = estado
        doc.requiere_revision = requiere_revision
        doc.observaciones = observaciones
        doc.confidence_global = confidence_global

        if nombre or nit:
            doc.provider_id = self._get_or_create_provider(nombre, nit).id

        self.db.flush()
        return doc

    def _get_or_create_provider(self, nombre: str | None, nit: str | None) -> ProviderModel:
        if nit:
            existing = self.db.query(ProviderModel).filter(ProviderModel.nit == nit).first()
            if existing:
                return existing
        provider = ProviderModel(nombre=nombre or "Desconocido", nit=nit)
        self.db.add(provider)
        self.db.flush()
        return provider

    def list_recent(self, limit: int = 50) -> list[DocumentModel]:
        return (
            self.db.query(DocumentModel)
            .order_by(DocumentModel.received_at.desc())
            .limit(limit)
            .all()
        )

    def list_for_crossing(
        self,
        *,
        batch_id: int | None = None,
        document_id: int | None = None,
        force: bool = False,
    ) -> list[DocumentModel]:
        eligible_states = [
            DocumentStatus.EXTRAIDO,
            DocumentStatus.PROCESADO,
            DocumentStatus.VALIDANDO,
            DocumentStatus.REQUIERE_REVISION,
            DocumentStatus.CRUZANDO,
        ]
        q = self.db.query(DocumentModel).filter(DocumentModel.estado.in_(eligible_states))
        if document_id:
            q = q.filter(DocumentModel.id == document_id)
        if not force:
            # document_id es nullable (filas que vienen solo del Excel de Autobits):
            # hay que excluir los NULL o el NOT IN descarta todos los documentos.
            subq = self.db.query(AccountCrossingModel.document_id).filter(
                AccountCrossingModel.document_id.isnot(None),
                AccountCrossingModel.estado.notin_([CrossingStatus.PAGADO]),
            )
            q = q.filter(~DocumentModel.id.in_(subq))
        return q.order_by(DocumentModel.received_at.desc()).all()


class ProcessingJobRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, document_id: int, mode: str, solicitud: str | None = None) -> ProcessingJobModel:
        job = ProcessingJobModel(
            document_id=document_id,
            mode=mode,
            solicitud_usuario=solicitud,
            status=ProcessingJobStatus.PENDING,
        )
        self.db.add(job)
        self.db.flush()
        return job

    def mark_processing(self, job: ProcessingJobModel) -> None:
        job.status = ProcessingJobStatus.PROCESSING
        job.started_at = datetime.now(timezone.utc)
        job.progress = 10
        self.db.flush()

    def mark_completed(self, job: ProcessingJobModel, progress: int = 100) -> None:
        job.status = ProcessingJobStatus.COMPLETED
        job.progress = progress
        job.finished_at = datetime.now(timezone.utc)
        self.db.flush()

    def mark_failed(self, job: ProcessingJobModel, error: str) -> None:
        job.status = ProcessingJobStatus.FAILED
        job.error_message = error
        job.finished_at = datetime.now(timezone.utc)
        self.db.flush()

    def mark_requires_review(self, job: ProcessingJobModel) -> None:
        job.status = ProcessingJobStatus.REQUIRES_REVIEW
        job.finished_at = datetime.now(timezone.utc)
        job.progress = 100
        self.db.flush()


class AuditRepository:
    def __init__(self, db: Session):
        self.db = db

    def log(
        self,
        accion: str,
        entidad: str,
        entidad_id: str,
        valor_anterior: str | None = None,
        valor_nuevo: str | None = None,
        usuario: str = "SISTEMA",
    ) -> None:
        self.db.add(
            AuditLogModel(
                usuario=usuario,
                accion=accion,
                entidad=entidad,
                entidad_id=entidad_id,
                valor_anterior=valor_anterior,
                valor_nuevo=valor_nuevo,
            )
        )
        self.db.flush()


class AutobitsRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_batch(
        self,
        *,
        filename: str,
        period_start: str | None,
        period_end: str | None,
        column_mapping_json: str,
        total_rows: int,
        storage_path: str,
        imported_by: str = "ANDREA",
        file_hash: str | None = None,
    ) -> ImportBatchModel:
        batch = ImportBatchModel(
            filename=filename,
            period_start=period_start,
            period_end=period_end,
            column_mapping_json=column_mapping_json,
            total_rows=total_rows,
            storage_path=storage_path,
            file_hash=file_hash,
            imported_by=imported_by,
            status=ImportBatchStatus.COMPLETED,
        )
        self.db.add(batch)
        self.db.flush()
        return batch

    def find_batch_by_file_hash(self, file_hash: str) -> ImportBatchModel | None:
        if not file_hash:
            return None
        return (
            self.db.query(ImportBatchModel)
            .filter(ImportBatchModel.file_hash == file_hash)
            .order_by(ImportBatchModel.imported_at.desc())
            .first()
        )

    def find_duplicate_record(
        self,
        record_hash: str,
        period_start: str | None,
        period_end: str | None,
    ) -> AutobitsRecordModel | None:
        q = self.db.query(AutobitsRecordModel).filter(AutobitsRecordModel.record_hash == record_hash)
        if period_start and period_end:
            q = q.join(ImportBatchModel).filter(
                ImportBatchModel.period_start == period_start,
                ImportBatchModel.period_end == period_end,
            )
        return q.first()

    def add_record(
        self,
        batch: ImportBatchModel,
        parsed,
    ) -> AutobitsRecordModel:
        record = AutobitsRecordModel(
            import_batch_id=batch.id,
            row_number=parsed.row_number,
            proveedor=parsed.proveedor,
            nit=parsed.nit,
            numero_compra=parsed.numero_compra,
            numero_reserva=parsed.numero_reserva,
            numero_documento=parsed.numero_documento,
            valor=parsed.valor,
            fecha=parsed.fecha,
            concepto=parsed.concepto,
            observaciones=getattr(parsed, "observaciones", None),
            estado_compra=getattr(parsed, "estado_compra", None),
            record_hash=parsed.record_hash(),
            raw_json=json.dumps(parsed.raw or {}, ensure_ascii=False),
            estado=AutobitsRecordStatus.IMPORTADO,
        )
        self.db.add(record)
        self.db.flush()

        if parsed.numero_compra:
            self.db.add(
                PurchaseModel(
                    autobits_record_id=record.id,
                    numero=parsed.numero_compra,
                    valor=parsed.valor,
                    fecha=parsed.fecha,
                )
            )
        if parsed.numero_reserva:
            self.db.add(
                ReservationModel(
                    autobits_record_id=record.id,
                    numero=parsed.numero_reserva,
                    valor=parsed.valor,
                    fecha=parsed.fecha,
                )
            )
        self.db.flush()
        return record

    def list_batches(self, limit: int = 50, offset: int = 0) -> tuple[list[ImportBatchModel], int]:
        q = self.db.query(ImportBatchModel).order_by(ImportBatchModel.imported_at.desc())
        total = q.count()
        items = q.offset(offset).limit(limit).all()
        return items, total

    def get_batch(self, batch_id: int) -> ImportBatchModel | None:
        return self.db.get(ImportBatchModel, batch_id)

    def get_latest_batch(self) -> ImportBatchModel | None:
        return (
            self.db.query(ImportBatchModel)
            .order_by(ImportBatchModel.imported_at.desc(), ImportBatchModel.id.desc())
            .first()
        )

    def update_record_from_parsed(
        self,
        record: AutobitsRecordModel,
        parsed,
        *,
        batch_id: int,
    ) -> AutobitsRecordModel:
        """Actualiza fila existente al reimportar el mismo Excel de la semana."""
        record.import_batch_id = batch_id
        record.row_number = parsed.row_number
        record.proveedor = parsed.proveedor
        record.nit = parsed.nit
        record.numero_compra = parsed.numero_compra
        record.numero_reserva = parsed.numero_reserva
        record.numero_documento = parsed.numero_documento
        record.valor = parsed.valor
        record.fecha = parsed.fecha
        record.concepto = parsed.concepto
        record.observaciones = getattr(parsed, "observaciones", None)
        record.estado_compra = getattr(parsed, "estado_compra", None)
        record.raw_json = json.dumps(parsed.raw or {}, ensure_ascii=False)
        self.db.flush()
        return record

    def list_records(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        batch_id: int | None = None,
        search: str | None = None,
        estado: str | None = None,
    ) -> tuple[list[AutobitsRecordModel], int]:
        q = self.db.query(AutobitsRecordModel).order_by(AutobitsRecordModel.created_at.desc())
        if batch_id:
            q = q.filter(AutobitsRecordModel.import_batch_id == batch_id)
        if estado:
            q = q.filter(AutobitsRecordModel.estado == estado)
        if search:
            term = f"%{search.strip()}%"
            q = q.filter(
                (AutobitsRecordModel.proveedor.ilike(term))
                | (AutobitsRecordModel.nit.ilike(term))
                | (AutobitsRecordModel.numero_compra.ilike(term))
                | (AutobitsRecordModel.numero_reserva.ilike(term))
                | (AutobitsRecordModel.numero_documento.ilike(term))
            )
        total = q.count()
        items = q.offset(offset).limit(limit).all()
        return items, total

    def get_record(self, record_id: int) -> AutobitsRecordModel | None:
        return self.db.get(AutobitsRecordModel, record_id)

    def mark_records_ready(self, batch_id: int) -> int:
        updated = (
            self.db.query(AutobitsRecordModel)
            .filter(
                AutobitsRecordModel.import_batch_id == batch_id,
                AutobitsRecordModel.estado == AutobitsRecordStatus.IMPORTADO,
            )
            .update({AutobitsRecordModel.estado: AutobitsRecordStatus.LISTO_PARA_ACTUALIZAR})
        )
        self.db.flush()
        return updated

    def finalize_batch_stats(
        self,
        batch: ImportBatchModel,
        *,
        imported_rows: int,
        skipped_rows: int,
        error_count: int,
    ) -> ImportBatchModel:
        batch.imported_rows = imported_rows
        batch.skipped_rows = skipped_rows
        batch.error_count = error_count
        self.db.flush()
        return batch

    def list_records_for_batch(self, batch_id: int) -> list[AutobitsRecordModel]:
        return (
            self.db.query(AutobitsRecordModel)
            .filter(AutobitsRecordModel.import_batch_id == batch_id)
            .all()
        )

    def list_all_records(self) -> list[AutobitsRecordModel]:
        return self.db.query(AutobitsRecordModel).all()


class CrossingRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, crossing_id: int) -> AccountCrossingModel | None:
        return self.db.get(AccountCrossingModel, crossing_id)

    def get_active_for_document(self, document_id: int) -> AccountCrossingModel | None:
        return (
            self.db.query(AccountCrossingModel)
            .filter(
                AccountCrossingModel.document_id == document_id,
                AccountCrossingModel.estado != CrossingStatus.PAGADO,
            )
            .order_by(AccountCrossingModel.created_at.desc())
            .first()
        )

    def is_record_matched(self, autobits_record_id: int) -> bool:
        """True si otra factura ya consumió esa fila del Excel."""
        if not autobits_record_id:
            return False
        return (
            self.db.query(AccountCrossingModel)
            .filter(
                AccountCrossingModel.autobits_record_id == autobits_record_id,
                AccountCrossingModel.document_id.isnot(None),
            )
            .first()
            is not None
        )

    def get_by_autobits_record(self, autobits_record_id: int) -> AccountCrossingModel | None:
        """Fila del cruce de esa fila del Excel; prioriza la que ya tiene documento."""
        return (
            self.db.query(AccountCrossingModel)
            .filter(AccountCrossingModel.autobits_record_id == autobits_record_id)
            .order_by(
                AccountCrossingModel.document_id.isnot(None).desc(),
                AccountCrossingModel.id.asc(),
            )
            .first()
        )

    def find_desde_autobits_by_keys(
        self,
        keys: set[str],
    ) -> dict[str, AccountCrossingModel]:
        if not keys:
            return {}
        rows = (
            self.db.query(AccountCrossingModel)
            .filter(AccountCrossingModel.match_type == MatchType.DESDE_AUTOBITS)
            .filter(AccountCrossingModel.estado != CrossingStatus.ARCHIVADO)
            .all()
        )
        from domain.autobits.business_key import autobits_business_key

        out: dict[str, AccountCrossingModel] = {}
        for row in rows:
            key = autobits_business_key(row.nit, row.numero_compra, row.numero_reserva)
            if key and key in keys and key not in out:
                out[key] = row
        return out

    def archive_stale_desde_autobits(
        self,
        *,
        active_batch_id: int,
        active_record_ids: set[int],
        active_keys: set[str],
    ) -> int:
        from domain.autobits.business_key import autobits_business_key

        archived = 0
        rows = (
            self.db.query(AccountCrossingModel)
            .filter(AccountCrossingModel.match_type == MatchType.DESDE_AUTOBITS)
            .filter(AccountCrossingModel.estado.notin_([CrossingStatus.PAGADO, CrossingStatus.ARCHIVADO]))
            .all()
        )
        for row in rows:
            key = autobits_business_key(row.nit, row.numero_compra, row.numero_reserva)
            in_batch = row.autobits_record_id in active_record_ids
            in_keys = bool(key and key in active_keys)
            same_batch = row.import_batch_id == active_batch_id
            if in_batch or in_keys or same_batch:
                continue
            row.estado = CrossingStatus.ARCHIVADO
            archived += 1
        if archived:
            self.db.flush()
        return archived

    def count_by_estado_for_batch(self, batch_id: int) -> dict[str, int]:
        from sqlalchemy import func

        rows = (
            self.db.query(AccountCrossingModel.estado, func.count(AccountCrossingModel.id))
            .join(AutobitsRecordModel, AccountCrossingModel.autobits_record_id == AutobitsRecordModel.id)
            .filter(AutobitsRecordModel.import_batch_id == batch_id)
            .group_by(AccountCrossingModel.estado)
            .all()
        )
        counts = {e.value: 0 for e in CrossingStatus}
        for estado, count in rows:
            counts[estado] = count
        return counts

    def create_crossing(
        self,
        *,
        document_id: int | None,
        autobits_record_id: int | None,
        match_type: str,
        match_score: float | None,
        estado: str,
        proveedor_nombre: str | None,
        numero_compra: str | None,
        numero_reserva: str | None,
        valor_documento: float | None,
        valor_autobits: float | None,
        diferencia: float | None,
        observaciones: str | None,
        match_reasons: str | None,
        nit: str | None = None,
        fecha_ejecucion: str | None = None,
        concepto: str | None = None,
        factura_cdc: str | None = None,
        fecha_pago: str | None = None,
        import_batch_id: int | None = None,
    ) -> AccountCrossingModel:
        crossing = AccountCrossingModel(
            document_id=document_id,
            autobits_record_id=autobits_record_id,
            import_batch_id=import_batch_id,
            match_type=match_type,
            match_score=match_score,
            estado=estado,
            proveedor_nombre=proveedor_nombre,
            nit=nit,
            numero_compra=numero_compra,
            numero_reserva=numero_reserva,
            fecha_ejecucion=fecha_ejecucion,
            concepto=concepto,
            valor_documento=valor_documento,
            valor_autobits=valor_autobits,
            diferencia=diferencia,
            factura_cdc=factura_cdc,
            fecha_pago=fecha_pago,
            observaciones=observaciones,
            match_reasons=match_reasons,
        )
        self.db.add(crossing)
        self.db.flush()
        return crossing

    def list_crossings(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        estado: str | None = None,
        match_type: str | None = None,
        batch_id: int | None = None,
        proveedor: str | None = None,
    ) -> tuple[list[AccountCrossingModel], int]:
        q = self.db.query(AccountCrossingModel).order_by(
            AccountCrossingModel.proveedor_nombre.asc(),
            AccountCrossingModel.fecha_ejecucion.asc(),
            AccountCrossingModel.created_at.desc(),
        )
        if estado:
            q = q.filter(AccountCrossingModel.estado == estado)
        if match_type:
            q = q.filter(AccountCrossingModel.match_type == match_type)
        if proveedor:
            q = q.filter(AccountCrossingModel.proveedor_nombre.ilike(f"%{proveedor}%"))
        if batch_id:
            q = q.join(AutobitsRecordModel).filter(AutobitsRecordModel.import_batch_id == batch_id)
        total = q.count()
        items = q.offset(offset).limit(limit).all()
        return items, total

    def update_estado(
        self,
        crossing: AccountCrossingModel,
        estado: str,
        *,
        approved_by: str | None = None,
        observaciones: str | None = None,
    ) -> AccountCrossingModel:
        crossing.estado = estado
        if approved_by:
            crossing.approved_by = approved_by
            crossing.approved_at = datetime.now(timezone.utc)
        if observaciones is not None:
            crossing.observaciones = observaciones
        self.db.flush()
        return crossing

    def create_remediation(
        self,
        *,
        document_id: int,
        crossing_id: int | None,
        proveedor: str | None,
        tipo_problema: str,
        descripcion: str,
        valor_involucrado: float | None = None,
    ) -> RemediationModel:
        remediation = RemediationModel(
            document_id=document_id,
            crossing_id=crossing_id,
            proveedor=proveedor,
            tipo_problema=tipo_problema,
            descripcion=descripcion,
            valor_involucrado=valor_involucrado,
            estado=RemediationStatus.PENDIENTE,
        )
        self.db.add(remediation)
        self.db.flush()
        return remediation

    def list_remediations_for_crossing(self, crossing_id: int) -> list[RemediationModel]:
        return (
            self.db.query(RemediationModel)
            .filter(RemediationModel.crossing_id == crossing_id)
            .all()
        )


class RemediationRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, remediation_id: int) -> RemediationModel | None:
        return self.db.get(RemediationModel, remediation_id)

    def create(
        self,
        *,
        document_id: int,
        crossing_id: int | None,
        proveedor: str | None,
        tipo_problema: str,
        descripcion: str,
        valor_involucrado: float | None = None,
        responsable: str | None = None,
        fecha_limite: str | None = None,
        observaciones: str | None = None,
        estado: str | None = None,
    ) -> RemediationModel:
        remediation = RemediationModel(
            document_id=document_id,
            crossing_id=crossing_id,
            proveedor=proveedor,
            tipo_problema=tipo_problema,
            descripcion=descripcion,
            valor_involucrado=valor_involucrado,
            responsable=responsable,
            fecha_limite=fecha_limite,
            observaciones=observaciones,
            estado=estado or RemediationStatus.PENDIENTE,
        )
        self.db.add(remediation)
        self.db.flush()
        return remediation

    def list_remediations(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        estado: str | None = None,
        tipo_problema: str | None = None,
        document_id: int | None = None,
        search: str | None = None,
    ) -> tuple[list[RemediationModel], int]:
        q = self.db.query(RemediationModel).order_by(RemediationModel.created_at.desc())
        if estado:
            q = q.filter(RemediationModel.estado == estado)
        if tipo_problema:
            q = q.filter(RemediationModel.tipo_problema == tipo_problema)
        if document_id:
            q = q.filter(RemediationModel.document_id == document_id)
        if search:
            term = f"%{search.strip()}%"
            q = q.filter(
                (RemediationModel.proveedor.ilike(term))
                | (RemediationModel.descripcion.ilike(term))
                | (RemediationModel.responsable.ilike(term))
            )
        total = q.count()
        items = q.offset(offset).limit(limit).all()
        return items, total

    def update(
        self,
        remediation: RemediationModel,
        *,
        proveedor: str | None = None,
        tipo_problema: str | None = None,
        descripcion: str | None = None,
        valor_involucrado: float | None = None,
        responsable: str | None = None,
        fecha_limite: str | None = None,
        observaciones: str | None = None,
        estado: str | None = None,
    ) -> RemediationModel:
        if proveedor is not None:
            remediation.proveedor = proveedor
        if tipo_problema is not None:
            remediation.tipo_problema = tipo_problema
        if descripcion is not None:
            remediation.descripcion = descripcion
        if valor_involucrado is not None:
            remediation.valor_involucrado = valor_involucrado
        if responsable is not None:
            remediation.responsable = responsable
        if fecha_limite is not None:
            remediation.fecha_limite = fecha_limite
        if observaciones is not None:
            remediation.observaciones = observaciones
        if estado is not None:
            remediation.estado = estado
        self.db.flush()
        return remediation

    def delete(self, remediation: RemediationModel) -> None:
        self.db.delete(remediation)
        self.db.flush()


class PaymentRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, payment_id: int) -> PaymentModel | None:
        return self.db.get(PaymentModel, payment_id)

    def get_by_crossing(self, crossing_id: int) -> PaymentModel | None:
        return self.db.query(PaymentModel).filter(PaymentModel.crossing_id == crossing_id).first()

    def get_active_by_crossing(self, crossing_id: int) -> PaymentModel | None:
        """Pago vigente del cruce; los anulados no bloquean uno nuevo."""
        return (
            self.db.query(PaymentModel)
            .filter(
                PaymentModel.crossing_id == crossing_id,
                PaymentModel.estado != PaymentStatus.ANULADO,
            )
            .order_by(PaymentModel.created_at.desc())
            .first()
        )

    def create(
        self,
        *,
        document_id: int | None,
        crossing_id: int | None,
        autobits_record_id: int | None,
        proveedor: str | None,
        numero_compra: str | None,
        numero_reserva: str | None,
        numero_documento: str | None,
        valor: float | None,
        observaciones: str | None = None,
    ) -> PaymentModel:
        payment = PaymentModel(
            document_id=document_id,
            crossing_id=crossing_id,
            autobits_record_id=autobits_record_id,
            proveedor=proveedor,
            numero_compra=numero_compra,
            numero_reserva=numero_reserva,
            numero_documento=numero_documento,
            valor=valor,
            observaciones=observaciones,
            estado=PaymentStatus.PENDIENTE_APROBACION,
        )
        self.db.add(payment)
        self.db.flush()
        return payment

    def list_payments(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        estado: str | None = None,
        search: str | None = None,
    ) -> tuple[list[PaymentModel], int]:
        q = self.db.query(PaymentModel).order_by(PaymentModel.created_at.desc())
        if estado:
            q = q.filter(PaymentModel.estado == estado)
        if search:
            term = f"%{search.strip()}%"
            q = q.filter(
                (PaymentModel.proveedor.ilike(term))
                | (PaymentModel.numero_compra.ilike(term))
                | (PaymentModel.numero_documento.ilike(term))
            )
        total = q.count()
        items = q.offset(offset).limit(limit).all()
        return items, total

    def list_pending_execution(self) -> list[PaymentModel]:
        return (
            self.db.query(PaymentModel)
            .filter(PaymentModel.estado == PaymentStatus.PENDIENTE_PAGO)
            .order_by(PaymentModel.created_at.asc())
            .all()
        )

    def update_estado(
        self,
        payment: PaymentModel,
        estado: str,
        *,
        approved_by: str | None = None,
        paid_by: str | None = None,
        observaciones: str | None = None,
    ) -> PaymentModel:
        payment.estado = estado
        if approved_by:
            payment.approved_by = approved_by
            payment.approved_at = datetime.now(timezone.utc)
        if paid_by:
            payment.paid_by = paid_by
            payment.paid_at = datetime.now(timezone.utc)
        if observaciones is not None:
            payment.observaciones = observaciones
        self.db.flush()
        return payment

    def add_receipt(
        self,
        payment: PaymentModel,
        *,
        filename: str,
        storage_path: str,
        file_hash: str | None,
        uploaded_by: str,
        contramarcado: bool = False,
    ) -> PaymentReceiptModel:
        receipt = PaymentReceiptModel(
            payment_id=payment.id,
            filename=filename,
            storage_path=storage_path,
            file_hash=file_hash,
            uploaded_by=uploaded_by,
            contramarcado=contramarcado,
        )
        self.db.add(receipt)
        self.db.flush()
        return receipt

    def get_receipt(self, receipt_id: int) -> PaymentReceiptModel | None:
        return self.db.get(PaymentReceiptModel, receipt_id)


class PackageRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, package_id: int) -> DigitalPackageModel | None:
        return self.db.get(DigitalPackageModel, package_id)

    def get_by_document(self, document_id: int) -> DigitalPackageModel | None:
        return (
            self.db.query(DigitalPackageModel)
            .filter(DigitalPackageModel.document_id == document_id)
            .order_by(DigitalPackageModel.created_at.desc())
            .first()
        )

    def create(
        self,
        *,
        document_id: int,
        crossing_id: int | None,
        payment_id: int | None,
        responsable: str = "KATHERINE",
        observaciones: str | None = None,
        period_start: str | None = None,
        period_end: str | None = None,
    ) -> DigitalPackageModel:
        package = DigitalPackageModel(
            document_id=document_id,
            crossing_id=crossing_id,
            payment_id=payment_id,
            responsable=responsable,
            observaciones=observaciones,
            period_start=period_start,
            period_end=period_end,
            estado=PackageStatus.PENDIENTE,
        )
        self.db.add(package)
        self.db.flush()
        return package

    def list_packages(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        estado: str | None = None,
        search: str | None = None,
    ) -> tuple[list[DigitalPackageModel], int]:
        q = self.db.query(DigitalPackageModel).order_by(DigitalPackageModel.created_at.desc())
        if estado:
            q = q.filter(DigitalPackageModel.estado == estado)
        if search:
            term = f"%{search.strip()}%"
            q = q.filter(
                (DigitalPackageModel.responsable.ilike(term))
                | (DigitalPackageModel.observaciones.ilike(term))
            )
        total = q.count()
        items = q.offset(offset).limit(limit).all()
        return items, total

    def update(
        self,
        package: DigitalPackageModel,
        *,
        estado: str | None = None,
        observaciones: str | None = None,
        storage_path: str | None = None,
        manifest_json: str | None = None,
        generated_at: datetime | None = None,
        delivered_at: datetime | None = None,
        responsable: str | None = None,
    ) -> DigitalPackageModel:
        if estado is not None:
            package.estado = estado
        if observaciones is not None:
            package.observaciones = observaciones
        if storage_path is not None:
            package.storage_path = storage_path
        if manifest_json is not None:
            package.manifest_json = manifest_json
        if generated_at is not None:
            package.generated_at = generated_at
        if delivered_at is not None:
            package.delivered_at = delivered_at
        if responsable is not None:
            package.responsable = responsable
        self.db.flush()
        return package

    def delete(self, package: DigitalPackageModel) -> None:
        self.db.delete(package)
        self.db.flush()


class AdjustmentRepository:
    """Anulaciones y ajustes contables (Fase 4.2)."""

    def __init__(self, db: Session):
        self.db = db

    def record(
        self,
        *,
        entity_type: str,
        entity_id: str,
        action: str = AdjustmentAction.AJUSTE,
        motivo: str,
        valor_anterior: str | None = None,
        valor_nuevo: str | None = None,
        related_entity_id: str | None = None,
        usuario: str = "SISTEMA",
    ) -> AccountingAdjustmentModel:
        adjustment = AccountingAdjustmentModel(
            entity_type=entity_type,
            entity_id=str(entity_id),
            action=action,
            motivo=motivo,
            valor_anterior=valor_anterior,
            valor_nuevo=valor_nuevo,
            related_entity_id=str(related_entity_id) if related_entity_id else None,
            usuario=usuario,
        )
        self.db.add(adjustment)
        self.db.flush()
        return adjustment

    def list_for_entity(self, entity_type: str, entity_id: str) -> list[AccountingAdjustmentModel]:
        return (
            self.db.query(AccountingAdjustmentModel)
            .filter(
                AccountingAdjustmentModel.entity_type == entity_type,
                AccountingAdjustmentModel.entity_id == str(entity_id),
            )
            .order_by(AccountingAdjustmentModel.created_at.desc())
            .all()
        )

    def list_adjustments(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        entity_type: str | None = None,
        action: str | None = None,
    ) -> tuple[list[AccountingAdjustmentModel], int]:
        q = self.db.query(AccountingAdjustmentModel).order_by(
            AccountingAdjustmentModel.created_at.desc()
        )
        if entity_type:
            q = q.filter(AccountingAdjustmentModel.entity_type == entity_type)
        if action:
            q = q.filter(AccountingAdjustmentModel.action == action)
        total = q.count()
        return q.offset(offset).limit(limit).all(), total


class PeriodClosureRepository:
    """Cierre operativo semanal (Fase 4.6)."""

    def __init__(self, db: Session):
        self.db = db

    def get_by_range(self, period_start: str, period_end: str) -> PeriodClosureModel | None:
        return (
            self.db.query(PeriodClosureModel)
            .filter(
                PeriodClosureModel.period_start == period_start,
                PeriodClosureModel.period_end == period_end,
            )
            .first()
        )

    def find_closed_containing(self, fecha_iso: str) -> PeriodClosureModel | None:
        """Cierre CERRADO cuyo rango contiene la fecha (ISO ordena lexicográficamente)."""
        return (
            self.db.query(PeriodClosureModel)
            .filter(
                PeriodClosureModel.status == PeriodClosureStatus.CLOSED,
                PeriodClosureModel.period_start <= fecha_iso,
                PeriodClosureModel.period_end >= fecha_iso,
            )
            .first()
        )

    def upsert(
        self,
        *,
        period_start: str,
        period_end: str,
        status: str,
        summary_json: str | None = None,
        observaciones: str | None = None,
        closed_by: str | None = None,
        reopened_by: str | None = None,
        motivo_reapertura: str | None = None,
    ) -> PeriodClosureModel:
        closure = self.get_by_range(period_start, period_end)
        if closure is None:
            closure = PeriodClosureModel(period_start=period_start, period_end=period_end)
            self.db.add(closure)

        closure.status = status
        if summary_json is not None:
            closure.summary_json = summary_json
        if observaciones is not None:
            closure.observaciones = observaciones

        if status == PeriodClosureStatus.CLOSED:
            closure.closed_by = closed_by
            closure.closed_at = datetime.now(timezone.utc)
        else:
            closure.reopened_by = reopened_by
            closure.reopened_at = datetime.now(timezone.utc)
            closure.motivo_reapertura = motivo_reapertura

        self.db.flush()
        return closure

    def list_closures(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        status: str | None = None,
    ) -> tuple[list[PeriodClosureModel], int]:
        q = self.db.query(PeriodClosureModel).order_by(PeriodClosureModel.period_start.desc())
        if status:
            q = q.filter(PeriodClosureModel.status == status)
        total = q.count()
        return q.offset(offset).limit(limit).all(), total


def _to_float(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        texto = str(value).replace("$", "").replace(" ", "")
        texto = texto.replace(".", "").replace(",", ".")
        return float(texto)
    except ValueError:
        return None
