"""Servicio de subsanaciones."""

from __future__ import annotations

from sqlalchemy.orm import Session

from domain.enums import DocumentStatus, RemediationStatus, RemediationType
from infrastructure.persistence.models import RemediationModel
from infrastructure.persistence.repositories import AuditRepository, DocumentRepository, RemediationRepository

REMEDIATION_TYPE_LABELS: dict[str, str] = {
    RemediationType.DIFERENCIA_VALOR: "Diferencia de valor",
    RemediationType.SIN_MATCH: "Sin match Autobits",
    RemediationType.SIN_NUMERO_DOCUMENTO: "Sin número de documento",
    RemediationType.SIN_PROVEEDOR: "Sin proveedor",
    RemediationType.COMPRA_SIN_RESERVA: "Compra sin reserva",
    RemediationType.NIT_NO_COINCIDE: "NIT no coincide",
    RemediationType.OTRO: "Otro",
}


class RemediationServiceError(Exception):
    def __init__(self, message: str, code: str = "REMEDIATION_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code


class RemediationService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = RemediationRepository(db)
        self.doc_repo = DocumentRepository(db)
        self.audit = AuditRepository(db)

    def type_catalog(self) -> list[dict]:
        return [{"key": key, "label": REMEDIATION_TYPE_LABELS.get(key, key)} for key in RemediationType]

    def status_catalog(self) -> list[str]:
        return list(RemediationStatus)

    def list_remediations(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        estado: str | None = None,
        tipo_problema: str | None = None,
        document_id: int | None = None,
        search: str | None = None,
    ) -> tuple[list[dict], int]:
        items, total = self.repo.list_remediations(
            limit=limit,
            offset=offset,
            estado=estado,
            tipo_problema=tipo_problema,
            document_id=document_id,
            search=search,
        )
        return [self.to_dict(r) for r in items], total

    def get_remediation(self, remediation_id: int) -> dict | None:
        remediation = self.repo.get_by_id(remediation_id)
        if not remediation:
            return None
        return self.to_dict(remediation)

    def create_manual(
        self,
        *,
        document_id: int,
        tipo_problema: str,
        descripcion: str,
        proveedor: str | None = None,
        valor_involucrado: float | None = None,
        responsable: str | None = None,
        fecha_limite: str | None = None,
        observaciones: str | None = None,
        crossing_id: int | None = None,
        usuario: str = "SISTEMA",
    ) -> dict:
        doc = self.doc_repo.get_by_id(document_id)
        if not doc:
            raise RemediationServiceError("Documento no encontrado.", "NOT_FOUND")

        if tipo_problema not in RemediationType:
            raise RemediationServiceError(f"Tipo de problema inválido: {tipo_problema}", "INVALID_TYPE")

        remediation = self.repo.create(
            document_id=document_id,
            crossing_id=crossing_id,
            proveedor=proveedor or (doc.provider.nombre if doc.provider else None),
            tipo_problema=tipo_problema,
            descripcion=descripcion,
            valor_involucrado=valor_involucrado,
            responsable=(responsable or "").strip() or usuario,
            fecha_limite=fecha_limite,
            observaciones=observaciones,
        )
        doc.estado = DocumentStatus.SUBSANACION

        self.audit.log("SUBSANACION_CREADA", "Remediation", str(remediation.id), usuario=usuario)
        self.db.commit()
        self.db.refresh(remediation)
        return self.to_dict(remediation)

    def update_remediation(
        self,
        remediation_id: int,
        *,
        proveedor: str | None = None,
        tipo_problema: str | None = None,
        descripcion: str | None = None,
        valor_involucrado: float | None = None,
        responsable: str | None = None,
        fecha_limite: str | None = None,
        observaciones: str | None = None,
        usuario: str = "SISTEMA",
    ) -> dict:
        remediation = self.repo.get_by_id(remediation_id)
        if not remediation:
            raise RemediationServiceError("Subsanación no encontrada.", "NOT_FOUND")

        if tipo_problema and tipo_problema not in RemediationType:
            raise RemediationServiceError(f"Tipo de problema inválido: {tipo_problema}", "INVALID_TYPE")

        self.repo.update(
            remediation,
            proveedor=proveedor,
            tipo_problema=tipo_problema,
            descripcion=descripcion,
            valor_involucrado=valor_involucrado,
            responsable=responsable,
            fecha_limite=fecha_limite,
            observaciones=observaciones,
        )
        self.audit.log("SUBSANACION_ACTUALIZADA", "Remediation", str(remediation_id), usuario=usuario)
        self.db.commit()
        self.db.refresh(remediation)
        return self.to_dict(remediation)

    def update_estado(
        self,
        remediation_id: int,
        estado: str,
        *,
        observaciones: str | None = None,
        usuario: str = "SISTEMA",
    ) -> dict:
        if estado not in RemediationStatus:
            raise RemediationServiceError(f"Estado inválido: {estado}", "INVALID_STATUS")

        remediation = self.repo.get_by_id(remediation_id)
        if not remediation:
            raise RemediationServiceError("Subsanación no encontrada.", "NOT_FOUND")

        anterior = remediation.estado
        self.repo.update(remediation, estado=estado, observaciones=observaciones)

        if estado == RemediationStatus.CORREGIDO and remediation.document:
            remediation.document.estado = DocumentStatus.REQUIERE_REVISION

        self.audit.log(
            "CAMBIO_ESTADO_SUBSANACION",
            "Remediation",
            str(remediation_id),
            valor_anterior=anterior,
            valor_nuevo=estado,
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(remediation)
        return self.to_dict(remediation)

    def delete_remediation(self, remediation_id: int, usuario: str = "SISTEMA") -> bool:
        remediation = self.repo.get_by_id(remediation_id)
        if not remediation:
            return False
        self.audit.log("SUBSANACION_ELIMINADA", "Remediation", str(remediation_id), usuario=usuario)
        self.repo.delete(remediation)
        self.db.commit()
        return True

    def to_dict(self, remediation: RemediationModel) -> dict:
        doc = remediation.document
        return {
            "id": remediation.id,
            "document_id": remediation.document_id,
            "document_filename": doc.filename if doc else None,
            "document_numero": doc.numero_documento if doc else None,
            "crossing_id": remediation.crossing_id,
            "proveedor": remediation.proveedor,
            "tipo_problema": remediation.tipo_problema,
            "tipo_problema_label": REMEDIATION_TYPE_LABELS.get(
                remediation.tipo_problema, remediation.tipo_problema
            ),
            "descripcion": remediation.descripcion,
            "valor_involucrado": remediation.valor_involucrado,
            "responsable": remediation.responsable,
            "fecha_limite": remediation.fecha_limite,
            "estado": remediation.estado,
            "observaciones": remediation.observaciones,
            "created_at": remediation.created_at.isoformat() if remediation.created_at else "",
            "updated_at": remediation.updated_at.isoformat() if remediation.updated_at else "",
        }
