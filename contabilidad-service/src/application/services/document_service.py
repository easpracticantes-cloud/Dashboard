"""Servicio de gestion de documentos — Fase 2."""

import json
import re
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from config.settings import PROYECTO_RAIZ, get_settings
from domain.enums import DocumentOrigin, DocumentStatus
from domain.services.duplicate_detector import DuplicateCheckResult, DuplicateDetector
from infrastructure.persistence.models import DocumentModel
from infrastructure.persistence.repositories import AuditRepository, DocumentRepository

settings = get_settings()
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}
STORAGE_ROOT = settings.storage_root


class DocumentUploadError(Exception):
    def __init__(self, message: str, code: str = "UPLOAD_ERROR"):
        self.message = message
        self.code = code
        super().__init__(message)


def sanitize_filename(name: str) -> str:
    """Elimina caracteres peligrosos del nombre."""
    base = Path(name).name
    return re.sub(r"[^\w.\-]", "_", base)[:200]


class DocumentService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = DocumentRepository(db)
        self.audit = AuditRepository(db)
        self.duplicates = DuplicateDetector(db)

    def list_documents(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        estado: str | None = None,
        tipo: str | None = None,
        search: str | None = None,
    ) -> tuple[list[DocumentModel], int]:
        q = self.db.query(DocumentModel)
        if estado:
            q = q.filter(DocumentModel.estado == estado)
        if tipo:
            q = q.filter(DocumentModel.tipo == tipo.upper())
        if search:
            term = f"%{search}%"
            q = q.filter(
                (DocumentModel.filename.ilike(term))
                | (DocumentModel.numero_documento.ilike(term))
                | (DocumentModel.concepto.ilike(term))
            )
        total = q.count()
        items = (
            q.order_by(DocumentModel.received_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return items, total

    def get_document(self, doc_id: int) -> DocumentModel | None:
        return self.repo.get_by_id(doc_id)

    def save_upload(
        self,
        file_content: bytes,
        filename: str,
        origen: str = DocumentOrigin.CARGA_MANUAL,
        tipo: str | None = None,
    ) -> tuple[DocumentModel, DuplicateCheckResult | None]:
        """Guarda archivo en storage y crea registro."""
        safe_name = sanitize_filename(filename)
        ext = Path(safe_name).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise DocumentUploadError(
                f"Extension no permitida: {ext}. Use jpg, jpeg, png o pdf.",
                "INVALID_EXTENSION",
            )

        max_bytes = settings.max_upload_mb * 1024 * 1024
        if len(file_content) > max_bytes:
            raise DocumentUploadError(
                f"Archivo supera el limite de {settings.max_upload_mb} MB.",
                "FILE_TOO_LARGE",
            )

        now = datetime.now()
        tipo_folder = (tipo or "FACTURA").upper()
        dest_dir = STORAGE_ROOT / str(now.year) / f"{now.month:02d}" / tipo_folder
        dest_dir.mkdir(parents=True, exist_ok=True)

        unique_name = f"{uuid.uuid4().hex[:8]}_{safe_name}"
        dest_path = dest_dir / unique_name
        dest_path.write_bytes(file_content)

        dup = self.duplicates.check_file(dest_path)
        doc = self.repo.create_from_file(
            dest_path,
            origen=origen,
            storage_path=str(dest_path),
            filename=safe_name,
        )
        if tipo:
            doc.tipo = tipo.upper()

        if dup.is_duplicate:
            doc.estado = DocumentStatus.DUPLICADO
            doc.observaciones = dup.reason
            doc.requiere_revision = True
            self.audit.log(
                "DUPLICADO_DETECTADO",
                "Document",
                str(doc.id),
                valor_nuevo=dup.reason,
            )

        self.db.commit()
        self.db.refresh(doc)
        return doc, dup if dup.is_duplicate else None

    def update_estado(self, doc_id: int, nuevo_estado: str, usuario: str = "SISTEMA") -> DocumentModel:
        doc = self.repo.get_by_id(doc_id)
        if not doc:
            raise DocumentUploadError("Documento no encontrado", "NOT_FOUND")
        anterior = doc.estado
        doc.estado = nuevo_estado
        self.audit.log(
            "CAMBIO_ESTADO",
            "Document",
            str(doc.id),
            valor_anterior=anterior,
            valor_nuevo=nuevo_estado,
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def delete_document(self, doc_id: int) -> bool:
        doc = self.repo.get_by_id(doc_id)
        if not doc:
            return False
        if doc.storage_path:
            p = Path(doc.storage_path)
            if p.exists() and p.is_file():
                try:
                    p.unlink()
                except OSError:
                    pass
        self.audit.log("ELIMINADO", "Document", str(doc.id))
        self.db.delete(doc)
        self.db.commit()
        return True

    def parse_confidence(self, doc: DocumentModel) -> dict:
        if not doc.extracted_json:
            return {"global": doc.confidence_global, "fields": {}, "fields_detail": {}}
        try:
            data = json.loads(doc.extracted_json)
            conf = data.get("_confidence", {})
            return {
                "global": doc.confidence_global or conf.get("global"),
                "fields": conf.get("fields", {}),
                "fields_detail": conf.get("fields_detail", {}),
            }
        except json.JSONDecodeError:
            return {"global": doc.confidence_global, "fields": {}, "fields_detail": {}}

    def to_detail_dict(self, doc: DocumentModel) -> dict:
        extracted = {}
        if doc.extracted_json:
            try:
                extracted = json.loads(doc.extracted_json)
                extracted.pop("_confidence", None)
            except json.JSONDecodeError:
                pass

        provider = None
        if doc.provider:
            provider = {"id": doc.provider.id, "nombre": doc.provider.nombre, "nit": doc.provider.nit}

        preview_url = None
        if doc.storage_path and Path(doc.storage_path).suffix.lower() in {".jpg", ".jpeg", ".png"}:
            preview_url = f"/api/documents/{doc.id}/preview"

        return {
            "id": doc.id,
            "filename": doc.filename,
            "tipo": doc.tipo,
            "origen": doc.origen,
            "estado": doc.estado,
            "provider": provider,
            "numero_documento": doc.numero_documento,
            "fecha_emision": doc.fecha_emision,
            "subtotal": doc.subtotal,
            "iva": doc.iva,
            "total": doc.total,
            "moneda": doc.moneda,
            "concepto": doc.concepto,
            "metodo_ocr": doc.metodo_ocr,
            "confidence": self.parse_confidence(doc),
            "requiere_revision": doc.requiere_revision,
            "observaciones": doc.observaciones,
            "extracted": extracted,
            "ocr_preview": (doc.ocr_text or "")[:500],
            "preview_url": preview_url,
            "storage_path": doc.storage_path,
            "received_at": doc.received_at.isoformat() if doc.received_at else "",
            "updated_at": doc.updated_at.isoformat() if doc.updated_at else "",
        }
