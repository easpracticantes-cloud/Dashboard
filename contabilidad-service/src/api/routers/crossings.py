"""Routers API — cruce de cuentas."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import resolve_usuario
from application.services.crossing_service import CrossingService, CrossingServiceError
from infrastructure.persistence.database import get_db

router = APIRouter(prefix="/api/crossings", tags=["crossings"])


class RunMatchingRequest(BaseModel):
    batch_id: int | None = None
    document_id: int | None = None
    force: bool = False
    usuario: str | None = None


class SeedRequest(BaseModel):
    batch_id: int | None = None
    use_latest: bool = True
    usuario: str | None = None


class PaymentsFromBatchRequest(BaseModel):
    batch_id: int | None = None
    usuario: str | None = None


class RunMatchingResponse(BaseModel):
    created: int
    items: list[dict]
    skipped: int | None = None
    updated: int | None = None
    changed: int | None = None
    archived: int | None = None
    batch_id: int | None = None
    batch: dict | None = None


class CrossingListResponse(BaseModel):
    total: int
    items: list[dict]


class ApproveRequest(BaseModel):
    usuario: str | None = None


class RejectRequest(BaseModel):
    motivo: str = ""
    usuario: str | None = None


class ManualLinkRequest(BaseModel):
    autobits_record_id: int
    usuario: str | None = None


class CompleteRequest(BaseModel):
    """Completa FACTURA/CDC (texto) y FECHA DE PAGO — sin archivo."""

    factura_cdc: str | None = None
    fecha_pago: str | None = None
    observaciones: str | None = None
    usuario: str | None = None


@router.post("/seed-from-autobits", response_model=RunMatchingResponse)
def seed_from_autobits(request: Request, body: SeedRequest, db: Session = Depends(get_db)):
    """Arma el cruce de cuentas desde registros Autobits (sin facturas)."""
    service = CrossingService(db)
    try:
        result = service.seed_from_autobits(
            batch_id=body.batch_id,
            use_latest=body.use_latest,
            usuario=resolve_usuario(request, body.usuario),
        )
    except CrossingServiceError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc
    return RunMatchingResponse(**result)


@router.post("/run", response_model=RunMatchingResponse)
def run_matching(request: Request, body: RunMatchingRequest, db: Session = Depends(get_db)):
    """Matching documento ↔ Autobits (opcional; el flujo principal es seed-from-autobits)."""
    service = CrossingService(db)
    try:
        result = service.run_matching(
            batch_id=body.batch_id,
            document_id=body.document_id,
            force=body.force,
            usuario=resolve_usuario(request, body.usuario),
        )
    except CrossingServiceError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc
    return RunMatchingResponse(**result)


@router.post("/approve-all-revision")
def approve_all_revision(request: Request, body: ApproveRequest, db: Session = Depends(get_db)):
    service = CrossingService(db)
    return service.approve_all_in_revision(resolve_usuario(request, body.usuario))


@router.get("/context")
def get_crossing_context(batch_id: int | None = None, db: Session = Depends(get_db)):
    """Excel Autobits vigente + resumen del cruce (flujo contable)."""
    service = CrossingService(db)
    return service.get_context(batch_id=batch_id)


@router.post("/payments-from-batch")
def create_payments_from_batch(
    request: Request,
    body: PaymentsFromBatchRequest,
    db: Session = Depends(get_db),
):
    """Genera pagos desde filas APROBADAS del Excel vigente."""
    service = CrossingService(db)
    try:
        return service.create_payments_from_batch(
            batch_id=body.batch_id,
            usuario=resolve_usuario(request, body.usuario),
        )
    except CrossingServiceError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc


@router.get("/proveedores")
def list_proveedores(db: Session = Depends(get_db)):
    service = CrossingService(db)
    return {"items": service.list_proveedores()}


@router.get("", response_model=CrossingListResponse)
def list_crossings(
    limit: int = 100,
    offset: int = 0,
    estado: str | None = None,
    match_type: str | None = None,
    batch_id: int | None = None,
    proveedor: str | None = None,
    db: Session = Depends(get_db),
):
    service = CrossingService(db)
    items, total = service.list_crossings(
        limit=min(limit, 500),
        offset=offset,
        estado=estado,
        match_type=match_type,
        batch_id=batch_id,
        proveedor=proveedor,
    )
    return CrossingListResponse(total=total, items=items)


@router.get("/{crossing_id}")
def get_crossing(crossing_id: int, db: Session = Depends(get_db)):
    service = CrossingService(db)
    data = service.get_crossing(crossing_id)
    if not data:
        raise HTTPException(status_code=404, detail="Cruce no encontrado")
    return data


@router.patch("/{crossing_id}/complete")
def complete_crossing(
    request: Request,
    crossing_id: int,
    body: CompleteRequest,
    db: Session = Depends(get_db),
):
    """Completa FACTURA/CDC y FECHA DE PAGO (metadatos; no confirma pago bancario)."""
    service = CrossingService(db)
    try:
        return service.complete_row(
            crossing_id,
            factura_cdc=body.factura_cdc,
            fecha_pago=body.fecha_pago,
            observaciones=body.observaciones,
            usuario=resolve_usuario(request, body.usuario),
        )
    except CrossingServiceError as exc:
        raise HTTPException(status_code=404, detail=exc.message) from exc


@router.post("/{crossing_id}/approve")
def approve_crossing(
    request: Request,
    crossing_id: int,
    body: ApproveRequest,
    db: Session = Depends(get_db),
):
    service = CrossingService(db)
    try:
        return service.approve(crossing_id, resolve_usuario(request, body.usuario))
    except CrossingServiceError as exc:
        raise HTTPException(status_code=404, detail=exc.message) from exc


@router.post("/{crossing_id}/reject")
def reject_crossing(
    request: Request,
    crossing_id: int,
    body: RejectRequest,
    db: Session = Depends(get_db),
):
    service = CrossingService(db)
    try:
        return service.reject(crossing_id, body.motivo, resolve_usuario(request, body.usuario))
    except CrossingServiceError as exc:
        raise HTTPException(status_code=404, detail=exc.message) from exc


@router.post("/{crossing_id}/link")
def manual_link(
    request: Request,
    crossing_id: int,
    body: ManualLinkRequest,
    db: Session = Depends(get_db),
):
    service = CrossingService(db)
    try:
        return service.manual_link(
            crossing_id,
            body.autobits_record_id,
            resolve_usuario(request, body.usuario),
        )
    except CrossingServiceError as exc:
        raise HTTPException(status_code=404, detail=exc.message) from exc
