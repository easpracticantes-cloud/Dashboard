"""Modelos SQLAlchemy — Fase 1."""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from domain.enums import (
    AdjustmentAction,
    AutobitsRecordStatus,
    CrossingStatus,
    DocumentOrigin,
    DocumentStatus,
    DocumentType,
    ImportBatchStatus,
    ProcessingJobStatus,
    ProcessingMode,
    MatchType,
    PackageStatus,
    PaymentStatus,
    PeriodClosureStatus,
    RemediationStatus,
)
from infrastructure.persistence.database import Base


class ProviderModel(Base):
    __tablename__ = "providers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    nit: Mapped[str | None] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    documents: Mapped[list["DocumentModel"]] = relationship(back_populates="provider")


class DocumentModel(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    file_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    storage_path: Mapped[str | None] = mapped_column(String(1024))
    tipo: Mapped[str] = mapped_column(String(32), default=DocumentType.OTRO)
    origen: Mapped[str] = mapped_column(String(32), default=DocumentOrigin.CARGA_MANUAL)
    estado: Mapped[str] = mapped_column(String(32), default=DocumentStatus.RECIBIDO, index=True)
    provider_id: Mapped[int | None] = mapped_column(ForeignKey("providers.id"))
    numero_documento: Mapped[str | None] = mapped_column(String(128), index=True)
    fecha_emision: Mapped[str | None] = mapped_column(String(32))
    subtotal: Mapped[float | None] = mapped_column(Float)
    iva: Mapped[float | None] = mapped_column(Float)
    total: Mapped[float | None] = mapped_column(Float)
    moneda: Mapped[str | None] = mapped_column(String(16))
    concepto: Mapped[str | None] = mapped_column(Text)
    extracted_json: Mapped[str | None] = mapped_column(Text)
    ocr_text: Mapped[str | None] = mapped_column(Text)
    metodo_ocr: Mapped[str | None] = mapped_column(String(32))
    confidence_global: Mapped[float | None] = mapped_column(Float)
    requiere_revision: Mapped[bool] = mapped_column(default=False)
    observaciones: Mapped[str | None] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    provider: Mapped[ProviderModel | None] = relationship(back_populates="documents")
    jobs: Mapped[list["ProcessingJobModel"]] = relationship(back_populates="document")
    crossings: Mapped[list["AccountCrossingModel"]] = relationship(back_populates="document")
    remediations: Mapped[list["RemediationModel"]] = relationship(back_populates="document")
    payments: Mapped[list["PaymentModel"]] = relationship(back_populates="document")
    packages: Mapped[list["DigitalPackageModel"]] = relationship(back_populates="document")


class ProcessingJobModel(Base):
    __tablename__ = "processing_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), index=True)
    mode: Mapped[str] = mapped_column(String(32), default=ProcessingMode.INTERACTIVE)
    status: Mapped[str] = mapped_column(String(32), default=ProcessingJobStatus.PENDING)
    solicitud_usuario: Mapped[str | None] = mapped_column(Text)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    document: Mapped[DocumentModel] = relationship(back_populates="jobs")


class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario: Mapped[str] = mapped_column(String(128), default="SISTEMA")
    accion: Mapped[str] = mapped_column(String(64), nullable=False)
    entidad: Mapped[str] = mapped_column(String(64), nullable=False)
    entidad_id: Mapped[str] = mapped_column(String(64), nullable=False)
    valor_anterior: Mapped[str | None] = mapped_column(Text)
    valor_nuevo: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ImportBatchModel(Base):
    __tablename__ = "autobits_import_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    period_start: Mapped[str | None] = mapped_column(String(32))
    period_end: Mapped[str | None] = mapped_column(String(32))
    column_mapping_json: Mapped[str | None] = mapped_column(Text)
    total_rows: Mapped[int] = mapped_column(Integer, default=0)
    imported_rows: Mapped[int] = mapped_column(Integer, default=0)
    skipped_rows: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default=ImportBatchStatus.COMPLETED, index=True)
    storage_path: Mapped[str | None] = mapped_column(String(1024))
    file_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    imported_by: Mapped[str] = mapped_column(String(128), default="ANDREA")
    imported_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    records: Mapped[list["AutobitsRecordModel"]] = relationship(back_populates="import_batch")


class AutobitsRecordModel(Base):
    __tablename__ = "autobits_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("autobits_import_batches.id"), index=True)
    row_number: Mapped[int] = mapped_column(Integer, default=0)
    proveedor: Mapped[str | None] = mapped_column(String(255))
    nit: Mapped[str | None] = mapped_column(String(64), index=True)
    numero_compra: Mapped[str | None] = mapped_column(String(128), index=True)
    numero_reserva: Mapped[str | None] = mapped_column(String(128), index=True)
    numero_documento: Mapped[str | None] = mapped_column(String(128), index=True)
    valor: Mapped[float | None] = mapped_column(Float)
    fecha: Mapped[str | None] = mapped_column(String(32))
    concepto: Mapped[str | None] = mapped_column(Text)
    observaciones: Mapped[str | None] = mapped_column(Text)
    estado_compra: Mapped[str | None] = mapped_column(String(64))
    estado: Mapped[str] = mapped_column(String(32), default=AutobitsRecordStatus.IMPORTADO, index=True)
    record_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    raw_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    import_batch: Mapped[ImportBatchModel] = relationship(back_populates="records")
    purchases: Mapped[list["PurchaseModel"]] = relationship(back_populates="autobits_record")
    reservations: Mapped[list["ReservationModel"]] = relationship(back_populates="autobits_record")
    crossings: Mapped[list["AccountCrossingModel"]] = relationship(back_populates="autobits_record")


class PurchaseModel(Base):
    __tablename__ = "autobits_purchases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    autobits_record_id: Mapped[int] = mapped_column(ForeignKey("autobits_records.id"), index=True)
    numero: Mapped[str] = mapped_column(String(128), nullable=False)
    valor: Mapped[float | None] = mapped_column(Float)
    fecha: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    autobits_record: Mapped[AutobitsRecordModel] = relationship(back_populates="purchases")


class ReservationModel(Base):
    __tablename__ = "autobits_reservations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    autobits_record_id: Mapped[int] = mapped_column(ForeignKey("autobits_records.id"), index=True)
    numero: Mapped[str] = mapped_column(String(128), nullable=False)
    valor: Mapped[float | None] = mapped_column(Float)
    fecha: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    autobits_record: Mapped[AutobitsRecordModel] = relationship(back_populates="reservations")


class AccountCrossingModel(Base):
    __tablename__ = "account_crossings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id"), index=True, nullable=True)
    autobits_record_id: Mapped[int | None] = mapped_column(ForeignKey("autobits_records.id"), index=True)
    import_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("autobits_import_batches.id"), index=True, nullable=True
    )
    match_type: Mapped[str] = mapped_column(String(32), default=MatchType.SIN_MATCH)
    match_score: Mapped[float | None] = mapped_column(Float)
    estado: Mapped[str] = mapped_column(String(32), default=CrossingStatus.PENDIENTE, index=True)
    proveedor_nombre: Mapped[str | None] = mapped_column(String(255), index=True)
    nit: Mapped[str | None] = mapped_column(String(64))
    numero_compra: Mapped[str | None] = mapped_column(String(128))
    numero_reserva: Mapped[str | None] = mapped_column(String(128))
    fecha_ejecucion: Mapped[str | None] = mapped_column(String(32))
    concepto: Mapped[str | None] = mapped_column(Text)
    valor_documento: Mapped[float | None] = mapped_column(Float)
    valor_autobits: Mapped[float | None] = mapped_column(Float)
    diferencia: Mapped[float | None] = mapped_column(Float)
    factura_cdc: Mapped[str | None] = mapped_column(String(255))
    fecha_pago: Mapped[str | None] = mapped_column(String(32))
    observaciones: Mapped[str | None] = mapped_column(Text)
    match_reasons: Mapped[str | None] = mapped_column(Text)
    approved_by: Mapped[str | None] = mapped_column(String(128))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    document: Mapped[DocumentModel | None] = relationship(back_populates="crossings")
    autobits_record: Mapped[AutobitsRecordModel | None] = relationship(back_populates="crossings")
    remediations: Mapped[list["RemediationModel"]] = relationship(back_populates="crossing")
    payments: Mapped[list["PaymentModel"]] = relationship(back_populates="crossing")


class RemediationModel(Base):
    __tablename__ = "remediations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), index=True)
    crossing_id: Mapped[int | None] = mapped_column(ForeignKey("account_crossings.id"), index=True)
    proveedor: Mapped[str | None] = mapped_column(String(255))
    tipo_problema: Mapped[str] = mapped_column(String(64), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    valor_involucrado: Mapped[float | None] = mapped_column(Float)
    responsable: Mapped[str | None] = mapped_column(String(128))
    fecha_limite: Mapped[str | None] = mapped_column(String(32))
    estado: Mapped[str] = mapped_column(String(32), default=RemediationStatus.PENDIENTE, index=True)
    observaciones: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    document: Mapped[DocumentModel] = relationship(back_populates="remediations")
    crossing: Mapped[AccountCrossingModel | None] = relationship(back_populates="remediations")


class PaymentModel(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id"), index=True, nullable=True)
    crossing_id: Mapped[int | None] = mapped_column(ForeignKey("account_crossings.id"), index=True)
    autobits_record_id: Mapped[int | None] = mapped_column(ForeignKey("autobits_records.id"), index=True)
    proveedor: Mapped[str | None] = mapped_column(String(255))
    numero_compra: Mapped[str | None] = mapped_column(String(128))
    numero_reserva: Mapped[str | None] = mapped_column(String(128))
    numero_documento: Mapped[str | None] = mapped_column(String(128))
    valor: Mapped[float | None] = mapped_column(Float)
    estado: Mapped[str] = mapped_column(String(32), default=PaymentStatus.PENDIENTE_APROBACION, index=True)
    observaciones: Mapped[str | None] = mapped_column(Text)
    approved_by: Mapped[str | None] = mapped_column(String(128))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime)
    paid_by: Mapped[str | None] = mapped_column(String(128))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    document: Mapped[DocumentModel] = relationship(back_populates="payments")
    crossing: Mapped[AccountCrossingModel | None] = relationship(back_populates="payments")
    receipts: Mapped[list["PaymentReceiptModel"]] = relationship(back_populates="payment")


class PaymentReceiptModel(Base):
    __tablename__ = "payment_receipts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id"), index=True)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_hash: Mapped[str | None] = mapped_column(String(64))
    contramarcado: Mapped[bool] = mapped_column(default=False)
    uploaded_by: Mapped[str] = mapped_column(String(128), default="ANDREA")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    payment: Mapped[PaymentModel] = relationship(back_populates="receipts")


class DigitalPackageModel(Base):
    __tablename__ = "digital_packages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), index=True)
    crossing_id: Mapped[int | None] = mapped_column(ForeignKey("account_crossings.id"), index=True)
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id"), index=True)
    estado: Mapped[str] = mapped_column(String(32), default=PackageStatus.PENDIENTE, index=True)
    responsable: Mapped[str] = mapped_column(String(128), default="KATHERINE")
    observaciones: Mapped[str | None] = mapped_column(Text)
    storage_path: Mapped[str | None] = mapped_column(String(1024))
    manifest_json: Mapped[str | None] = mapped_column(Text)
    period_start: Mapped[str | None] = mapped_column(String(32))
    period_end: Mapped[str | None] = mapped_column(String(32))
    generated_at: Mapped[datetime | None] = mapped_column(DateTime)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    document: Mapped[DocumentModel] = relationship(back_populates="packages")
    crossing: Mapped[AccountCrossingModel | None] = relationship()
    payment: Mapped[PaymentModel | None] = relationship()


class AccountingAdjustmentModel(Base):
    """Anulaciones y ajustes contables — Fase 4.2.

    Nada se borra: toda corrección deja rastro del valor anterior y el motivo.
    """

    __tablename__ = "accounting_adjustments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(32), default=AdjustmentAction.AJUSTE, index=True)
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
    valor_anterior: Mapped[str | None] = mapped_column(Text)
    valor_nuevo: Mapped[str | None] = mapped_column(Text)
    related_entity_id: Mapped[str | None] = mapped_column(String(64), index=True)
    usuario: Mapped[str] = mapped_column(String(128), default="SISTEMA")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class PeriodClosureModel(Base):
    """Cierre operativo semanal (sábado–viernes) — Fase 4.6."""

    __tablename__ = "period_closures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period_start: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    period_end: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), default=PeriodClosureStatus.OPEN, index=True)
    summary_json: Mapped[str | None] = mapped_column(Text)
    observaciones: Mapped[str | None] = mapped_column(Text)
    closed_by: Mapped[str | None] = mapped_column(String(128))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)
    reopened_by: Mapped[str | None] = mapped_column(String(128))
    reopened_at: Mapped[datetime | None] = mapped_column(DateTime)
    motivo_reapertura: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
