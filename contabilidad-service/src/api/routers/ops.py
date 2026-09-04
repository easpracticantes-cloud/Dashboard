"""Routers API — trazabilidad y cola operativa (Fase 4.5/4.6).

Cadena AP: Autobits → Factura → Cruce → Pago → Comprobante → Paquete.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from application.services.ops_service import OpsService
from infrastructure.persistence.database import get_db

router = APIRouter(tags=["ops"])


def _period_params(
    week_ref: str | None = None,
    period_start: str | None = None,
    period_end: str | None = None,
    mes: int | None = None,
    anio: int | None = None,
) -> dict:
    return {
        "week_ref": week_ref,
        "period_start": period_start,
        "period_end": period_end,
        "mes": mes,
        "anio": anio,
    }


@router.get("/api/ops/chain/{document_id}")
def get_chain(document_id: int, db: Session = Depends(get_db)):
    """Cadena documental de una factura y los eslabones que faltan."""
    data = OpsService(db).get_chain(document_id)
    if not data:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return data


@router.get("/api/reconciliation/chain")
def get_chain_by_query(document_id: int, db: Session = Depends(get_db)):
    """Alias de `/api/ops/chain/{document_id}` por parámetro de consulta."""
    return get_chain(document_id, db)


@router.get("/api/ops/queue")
def get_queue(
    week_ref: str | None = None,
    period_start: str | None = None,
    period_end: str | None = None,
    mes: int | None = None,
    anio: int | None = None,
    db: Session = Depends(get_db),
):
    """Trabajo pendiente del período agrupado por tipo."""
    return OpsService(db).get_queue(
        **_period_params(week_ref, period_start, period_end, mes, anio)
    )


@router.get("/api/ops/alerts")
def get_alerts(
    week_ref: str | None = None,
    period_start: str | None = None,
    period_end: str | None = None,
    mes: int | None = None,
    anio: int | None = None,
    db: Session = Depends(get_db),
):
    """Alertas priorizadas del período (misma base que la cola)."""
    return OpsService(db).get_alerts(
        **_period_params(week_ref, period_start, period_end, mes, anio)
    )
