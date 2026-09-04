"""Routers API — cierre operativo semanal (Fase 4.6)."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import assert_can_reopen_period, assert_can_write_contabilidad, resolve_usuario
from application.services.period_service import PeriodService, PeriodServiceError
from infrastructure.persistence.database import get_db

router = APIRouter(prefix="/api/periods", tags=["periods"])


class ClosureListResponse(BaseModel):
    total: int
    items: list[dict]


class CloseRequest(BaseModel):
    week_ref: str | None = None
    period_start: str | None = None
    period_end: str | None = None
    observaciones: str | None = None
    # Alias del frontend (periods-api.service envía ``resumen``).
    resumen: str | None = None
    usuario: str | None = None


class ReopenRequest(BaseModel):
    motivo: str
    week_ref: str | None = None
    period_start: str | None = None
    period_end: str | None = None
    usuario: str | None = None


@router.get("/status")
def get_status(
    week_ref: str | None = None,
    period_start: str | None = None,
    period_end: str | None = None,
    db: Session = Depends(get_db),
):
    """Estado (OPEN/CLOSED) de la semana consultada."""
    service = PeriodService(db)
    try:
        return service.get_status(
            week_ref=week_ref,
            period_start=period_start,
            period_end=period_end,
        )
    except (PeriodServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=_mensaje(exc)) from exc


@router.get("", response_model=ClosureListResponse)
def list_closures(
    limit: int = 50,
    offset: int = 0,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    """Historial de cierres semanales."""
    service = PeriodService(db)
    items, total = service.list_closures(limit=min(limit, 200), offset=offset, status=status)
    return ClosureListResponse(total=total, items=items)


@router.post("/close")
def close_period(request: Request, body: CloseRequest, db: Session = Depends(get_db)):
    """Cierra la semana contable: congela pagos, cruces y borrado de documentos."""
    assert_can_write_contabilidad(request)
    service = PeriodService(db)
    try:
        return service.close_week(
            week_ref=body.week_ref,
            period_start=body.period_start,
            period_end=body.period_end,
            observaciones=body.observaciones or body.resumen,
            usuario=resolve_usuario(request, body.usuario),
        )
    except (PeriodServiceError, ValueError) as exc:
        status = 409 if getattr(exc, "code", None) == "ALREADY_CLOSED" else 400
        raise HTTPException(status_code=status, detail=_mensaje(exc)) from exc


@router.post("/reopen")
def reopen_period(request: Request, body: ReopenRequest, db: Session = Depends(get_db)):
    """Reabre una semana cerrada; exige motivo, rol ADMIN/GERENCIA y queda auditado."""
    assert_can_reopen_period(request)
    service = PeriodService(db)
    try:
        return service.reopen(
            motivo=body.motivo,
            week_ref=body.week_ref,
            period_start=body.period_start,
            period_end=body.period_end,
            usuario=resolve_usuario(request, body.usuario),
        )
    except (PeriodServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=_mensaje(exc)) from exc


def _mensaje(exc: Exception) -> str:
    mensaje = getattr(exc, "message", None)
    if mensaje:
        return mensaje
    return "Período inválido. Use fechas ISO (YYYY-MM-DD)."
