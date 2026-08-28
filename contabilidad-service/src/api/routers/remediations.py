"""Routers API — subsanaciones (Fase 5)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from application.services.remediation_service import RemediationService, RemediationServiceError
from infrastructure.persistence.database import get_db

router = APIRouter(prefix="/api/remediations", tags=["remediations"])


class RemediationSummary(BaseModel):
    id: int
    document_id: int
    document_filename: str | None = None
    document_numero: str | None = None
    crossing_id: int | None = None
    proveedor: str | None = None
    tipo_problema: str
    tipo_problema_label: str
    descripcion: str
    valor_involucrado: float | None = None
    responsable: str | None = None
    fecha_limite: str | None = None
    estado: str
    observaciones: str | None = None
    created_at: str
    updated_at: str


class RemediationListResponse(BaseModel):
    total: int
    items: list[RemediationSummary]


class RemediationCreate(BaseModel):
    document_id: int
    tipo_problema: str
    descripcion: str
    proveedor: str | None = None
    valor_involucrado: float | None = None
    responsable: str = "ANDREA"
    fecha_limite: str | None = None
    observaciones: str | None = None
    crossing_id: int | None = None
    usuario: str = "ANDREA"


class RemediationUpdate(BaseModel):
    proveedor: str | None = None
    tipo_problema: str | None = None
    descripcion: str | None = None
    valor_involucrado: float | None = None
    responsable: str | None = None
    fecha_limite: str | None = None
    observaciones: str | None = None
    usuario: str = "ANDREA"


class EstadoUpdate(BaseModel):
    estado: str
    observaciones: str | None = None
    usuario: str = "ANDREA"


@router.get("/catalog")
def get_catalog(db: Session = Depends(get_db)):
    """Tipos y estados disponibles para subsanaciones."""
    service = RemediationService(db)
    return {"types": service.type_catalog(), "statuses": service.status_catalog()}


@router.get("", response_model=RemediationListResponse)
def list_remediations(
    limit: int = 50,
    offset: int = 0,
    estado: str | None = None,
    tipo_problema: str | None = None,
    document_id: int | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    """Lista subsanaciones con filtros."""
    service = RemediationService(db)
    items, total = service.list_remediations(
        limit=min(limit, 200),
        offset=offset,
        estado=estado,
        tipo_problema=tipo_problema,
        document_id=document_id,
        search=search,
    )
    return RemediationListResponse(total=total, items=items)


@router.get("/{remediation_id}", response_model=RemediationSummary)
def get_remediation(remediation_id: int, db: Session = Depends(get_db)):
    """Detalle de una subsanación."""
    service = RemediationService(db)
    data = service.get_remediation(remediation_id)
    if not data:
        raise HTTPException(status_code=404, detail="Subsanación no encontrada")
    return RemediationSummary(**data)


@router.post("", response_model=RemediationSummary)
def create_remediation(body: RemediationCreate, db: Session = Depends(get_db)):
    """Crea una subsanación manual."""
    service = RemediationService(db)
    try:
        data = service.create_manual(
            document_id=body.document_id,
            tipo_problema=body.tipo_problema,
            descripcion=body.descripcion,
            proveedor=body.proveedor,
            valor_involucrado=body.valor_involucrado,
            responsable=body.responsable,
            fecha_limite=body.fecha_limite,
            observaciones=body.observaciones,
            crossing_id=body.crossing_id,
            usuario=body.usuario,
        )
    except RemediationServiceError as exc:
        status = 404 if exc.code == "NOT_FOUND" else 400
        raise HTTPException(status_code=status, detail=exc.message) from exc
    return RemediationSummary(**data)


@router.patch("/{remediation_id}", response_model=RemediationSummary)
def update_remediation(
    remediation_id: int,
    body: RemediationUpdate,
    db: Session = Depends(get_db),
):
    """Actualiza campos de una subsanación."""
    service = RemediationService(db)
    try:
        data = service.update_remediation(
            remediation_id,
            proveedor=body.proveedor,
            tipo_problema=body.tipo_problema,
            descripcion=body.descripcion,
            valor_involucrado=body.valor_involucrado,
            responsable=body.responsable,
            fecha_limite=body.fecha_limite,
            observaciones=body.observaciones,
            usuario=body.usuario,
        )
    except RemediationServiceError as exc:
        status = 404 if exc.code == "NOT_FOUND" else 400
        raise HTTPException(status_code=status, detail=exc.message) from exc
    return RemediationSummary(**data)


@router.patch("/{remediation_id}/estado", response_model=RemediationSummary)
def update_estado(
    remediation_id: int,
    body: EstadoUpdate,
    db: Session = Depends(get_db),
):
    """Cambia el estado de una subsanación."""
    service = RemediationService(db)
    try:
        data = service.update_estado(
            remediation_id,
            body.estado,
            observaciones=body.observaciones,
            usuario=body.usuario,
        )
    except RemediationServiceError as exc:
        status = 404 if exc.code == "NOT_FOUND" else 400
        raise HTTPException(status_code=status, detail=exc.message) from exc
    return RemediationSummary(**data)


@router.delete("/{remediation_id}")
def delete_remediation(remediation_id: int, db: Session = Depends(get_db)):
    """Elimina una subsanación."""
    service = RemediationService(db)
    if not service.delete_remediation(remediation_id):
        raise HTTPException(status_code=404, detail="Subsanación no encontrada")
    return {"ok": True, "deleted_id": remediation_id}
