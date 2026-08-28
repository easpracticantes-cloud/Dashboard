"""Deteccion de documentos duplicados."""

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

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
    ) -> DuplicateCheckResult:
        """Detecta posible duplicado por NIT + numero + total."""
        if not numero:
            return DuplicateCheckResult(is_duplicate=False)

        q = self.repo.db.query(DocumentModel).filter(
            DocumentModel.numero_documento == numero,
        )
        if exclude_id:
            q = q.filter(DocumentModel.id != exclude_id)

        for doc in q.all():
            if total is not None and doc.total is not None:
                if abs(doc.total - total) < 0.01:
                    return DuplicateCheckResult(
                        is_duplicate=True,
                        reason=f"Posible duplicado: mismo numero y total (doc #{doc.id})",
                        existing_document_id=doc.id,
                        match_type="METADATA",
                    )
            elif doc.numero_documento == numero:
                return DuplicateCheckResult(
                    is_duplicate=True,
                    reason=f"Posible duplicado: mismo numero de documento (doc #{doc.id})",
                    existing_document_id=doc.id,
                    match_type="METADATA",
                )

        return DuplicateCheckResult(is_duplicate=False)
