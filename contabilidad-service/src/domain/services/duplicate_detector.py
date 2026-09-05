"""Deteccion de documentos duplicados."""

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from domain.matching.normalize import normalize_nit
import hashlib

from infrastructure.persistence.models import DocumentModel
from infrastructure.persistence.repositories import DocumentRepository, file_hash


@dataclass
class DuplicateCheckResult:
    is_duplicate: bool
    reason: str = ""
    existing_document_id: int | None = None
    match_type: str = ""  # HASH | METADATA


class DuplicateDetector:
    def __init__(self, db: Session):
        self.repo = DocumentRepository(db)

    def check_bytes(self, content: bytes, exclude_id: int | None = None) -> DuplicateCheckResult:
        """Detecta duplicado por hash de bytes, sin escribir el archivo."""
        h = hashlib.sha256(content or b"").hexdigest()
        existing = (
            self.repo.db.query(DocumentModel)
            .filter(DocumentModel.file_hash == h)
            .first()
        )
        if existing and existing.id != exclude_id:
            return DuplicateCheckResult(
                is_duplicate=True,
                reason=f"Este archivo ya está importado (doc #{existing.id}). No se permiten duplicados.",
                existing_document_id=existing.id,
                match_type="HASH",
            )
        return DuplicateCheckResult(is_duplicate=False)

    def check_file(self, path: Path, exclude_id: int | None = None) -> DuplicateCheckResult:
        """Detecta duplicado por hash de archivo."""
        h = file_hash(path)
        existing = (
            self.repo.db.query(DocumentModel)
            .filter(DocumentModel.file_hash == h)
            .first()
        )
        if existing and existing.id != exclude_id:
            return DuplicateCheckResult(
                is_duplicate=True,
                reason="Archivo identico ya registrado (mismo hash)",
                existing_document_id=existing.id,
                match_type="HASH",
            )
        return DuplicateCheckResult(is_duplicate=False)

    def check_metadata(
        self,
        nit: str | None,
        numero: str | None,
        total: float | None,
        exclude_id: int | None = None,
        fecha_emision: str | None = None,
    ) -> DuplicateCheckResult:
        """Detecta posible duplicado por NIT + numero + total (+ fecha opcional)."""
        if not numero:
            return DuplicateCheckResult(is_duplicate=False)

        q = self.repo.db.query(DocumentModel).filter(
            DocumentModel.numero_documento == numero,
        )
        if exclude_id:
            q = q.filter(DocumentModel.id != exclude_id)

        want_nit = normalize_nit(nit) if nit else ""
        want_fecha = (fecha_emision or "").strip()[:10]

        for doc in q.all():
            doc_nit = ""
            if doc.provider and doc.provider.nit:
                doc_nit = normalize_nit(doc.provider.nit)

            if want_nit and doc_nit and want_nit != doc_nit:
                continue

            same_total = (
                total is not None
                and doc.total is not None
                and abs(doc.total - total) < 0.01
            )
            same_fecha = False
            if want_fecha and doc.fecha_emision:
                same_fecha = doc.fecha_emision.strip()[:10] == want_fecha

            if want_nit and doc_nit and want_nit == doc_nit and same_total:
                return DuplicateCheckResult(
                    is_duplicate=True,
                    reason=f"Posible duplicado: mismo NIT, numero y total (doc #{doc.id})",
                    existing_document_id=doc.id,
                    match_type="METADATA",
                )
            if want_nit and doc_nit and want_nit == doc_nit and same_fecha:
                return DuplicateCheckResult(
                    is_duplicate=True,
                    reason=f"Posible duplicado: mismo NIT, numero y fecha (doc #{doc.id})",
                    existing_document_id=doc.id,
                    match_type="METADATA",
                )
            if not want_nit and same_total:
                return DuplicateCheckResult(
                    is_duplicate=True,
                    reason=f"Posible duplicado: mismo numero y total (doc #{doc.id})",
                    existing_document_id=doc.id,
                    match_type="METADATA",
                )
            if not want_nit and not same_total and doc.numero_documento == numero:
                return DuplicateCheckResult(
                    is_duplicate=True,
                    reason=f"Posible duplicado: mismo numero de documento (doc #{doc.id})",
                    existing_document_id=doc.id,
                    match_type="METADATA",
                )

        return DuplicateCheckResult(is_duplicate=False)
