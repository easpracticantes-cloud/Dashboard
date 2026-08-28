"""Routers API — dashboard y reportes (Fase 8)."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse
from sqlalchemy.orm import Session

from application.services.dashboard_service import DashboardService
from application.services.report_service import ReportService
from infrastructure.persistence.database import get_db

router = APIRouter(tags=["dashboard"])


def _period_params(
    period_start: str | None = None,
    period_end: str | None = None,
    week_ref: str | None = None,
    mes: int | None = None,
    anio: int | None = None,
) -> dict:
    return {
        "period_start": period_start,
        "period_end": period_end,
        "week_ref": week_ref,
        "mes": mes,
        "anio": anio,
    }


@router.get("/api/dashboard/weeks")
def list_weeks(db: Session = Depends(get_db)):
    """Semanas contables recientes (sábado–viernes)."""
    service = DashboardService(db)
    return {"weeks": service.get_weeks()}


@router.get("/api/dashboard/kpis")
def get_kpis(
    period_start: str | None = None,
    period_end: str | None = None,
    week_ref: str | None = None,
    mes: int | None = None,
    anio: int | None = None,
    proveedor: str | None = None,
    estado: str | None = None,
    tipo: str | None = None,
    db: Session = Depends(get_db),
):
    """KPIs del período con filtros."""
    service = DashboardService(db)
    return service.get_kpis(
        period_start=period_start,
        period_end=period_end,
        week_ref=week_ref,
        mes=mes,
        anio=anio,
        proveedor=proveedor,
        estado=estado,
        tipo=tipo,
    )


@router.get("/api/reports/documents.csv")
def export_documents_csv(
    period_start: str | None = None,
    period_end: str | None = None,
    week_ref: str | None = None,
    mes: int | None = None,
    anio: int | None = None,
    db: Session = Depends(get_db),
):
    service = ReportService(db)
    content = service.export_documents_csv(**_period_params(period_start, period_end, week_ref, mes, anio))
    return PlainTextResponse(content, media_type="text/csv", headers={
        "Content-Disposition": 'attachment; filename="reporte_documentos.csv"'
    })


@router.get("/api/reports/payments.csv")
def export_payments_csv(
    period_start: str | None = None,
    period_end: str | None = None,
    week_ref: str | None = None,
    mes: int | None = None,
    anio: int | None = None,
    db: Session = Depends(get_db),
):
    service = ReportService(db)
    content = service.export_payments_csv(**_period_params(period_start, period_end, week_ref, mes, anio))
    return PlainTextResponse(content, media_type="text/csv", headers={
        "Content-Disposition": 'attachment; filename="reporte_pagos.csv"'
    })


@router.get("/api/reports/crossings.csv")
def export_crossings_csv(
    period_start: str | None = None,
    period_end: str | None = None,
    week_ref: str | None = None,
    mes: int | None = None,
    anio: int | None = None,
    db: Session = Depends(get_db),
):
    service = ReportService(db)
    content = service.export_crossings_csv(**_period_params(period_start, period_end, week_ref, mes, anio))
    return PlainTextResponse(content, media_type="text/csv", headers={
        "Content-Disposition": 'attachment; filename="reporte_cruces.csv"'
    })


@router.get("/api/reports/remediations.csv")
def export_remediations_csv(
    period_start: str | None = None,
    period_end: str | None = None,
    week_ref: str | None = None,
    mes: int | None = None,
    anio: int | None = None,
    db: Session = Depends(get_db),
):
    service = ReportService(db)
    content = service.export_remediations_csv(**_period_params(period_start, period_end, week_ref, mes, anio))
    return PlainTextResponse(content, media_type="text/csv", headers={
        "Content-Disposition": 'attachment; filename="reporte_subsanaciones.csv"'
    })


@router.get("/api/reports/semanal.html")
def export_weekly_html(
    period_start: str | None = None,
    period_end: str | None = None,
    week_ref: str | None = None,
    mes: int | None = None,
    anio: int | None = None,
    db: Session = Depends(get_db),
):
    """Reporte semanal HTML."""
    dash = DashboardService(db)
    report = ReportService(db)
    kpis = dash.get_kpis(
        period_start=period_start,
        period_end=period_end,
        week_ref=week_ref,
        mes=mes,
        anio=anio,
    )
    html = report.export_weekly_html(kpis)
    return HTMLResponse(content=html)
