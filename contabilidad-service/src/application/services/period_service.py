"""Cierre operativo semanal (sábado–viernes) — Fase 4.6.

Cerrar una semana congela la operación de ese período: no se generan pagos,
no se aprueban ni completan cruces, no se confirman pagos bancarios, no se
cargan comprobantes, no se generan paquetes y no se eliminan documentos. Las
correcciones siguen disponibles vía anulación/ajuste con motivo.
"""

from __future__ import annotations

import json
from datetime import date, datetime

from sqlalchemy.orm import Session

from domain.enums import PeriodClosureStatus
from domain.utils.period_utils import week_bounds_saturday
from infrastructure.persistence.models import PeriodClosureModel
from infrastructure.persistence.repositories import AuditRepository, PeriodClosureRepository


class PeriodServiceError(Exception):
    def __init__(self, message: str, code: str = "PERIOD_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code


class PeriodClosedError(PeriodServiceError):
    """El período ya fue cerrado: la operación mutaría datos congelados."""

    def __init__(self, message: str, code: str = "PERIOD_CLOSED"):
        super().__init__(message, code)


class PeriodService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = PeriodClosureRepository(db)
        self.audit = AuditRepository(db)

    # ------------------------------------------------------------------ consulta

    def is_period_closed(self, reference: date | datetime | str | None = None) -> bool:
        """True si la fecha cae dentro de una semana ya cerrada."""
        return self.repo.find_closed_containing(_a_iso(reference)) is not None

    def ensure_period_open(
        self,
        reference: date | datetime | str | None = None,
        *,
        accion: str = "modificar información del período",
    ) -> None:
        """Bloquea mutaciones sobre semanas cerradas."""
        closure = self.repo.find_closed_containing(_a_iso(reference))
        if closure is None:
            return
        raise PeriodClosedError(
            f"El período {closure.period_start} → {closure.period_end} está cerrado. "
            f"No se puede {accion}. Reabra la semana con motivo o registre un ajuste."
        )

    def get_closure(
        self,
        *,
        period_start: str | None = None,
        period_end: str | None = None,
        week_ref: str | None = None,
    ) -> dict | None:
        inicio, fin = self._resolver_rango(week_ref, period_start, period_end)
        closure = self.repo.get_by_range(inicio.isoformat(), fin.isoformat())
        return self.to_dict(closure) if closure else None

    def get_status(
        self,
        *,
        period_start: str | None = None,
        period_end: str | None = None,
        week_ref: str | None = None,
    ) -> dict:
        """Estado de la semana consultada, exista o no el registro de cierre."""
        inicio, fin = self._resolver_rango(week_ref, period_start, period_end)
        closure = self.repo.get_by_range(inicio.isoformat(), fin.isoformat())
        return {
            "period_start": inicio.isoformat(),
            "period_end": fin.isoformat(),
            "status": closure.status if closure else PeriodClosureStatus.OPEN,
            "cerrado": bool(closure and closure.status == PeriodClosureStatus.CLOSED),
            "closure": self.to_dict(closure) if closure else None,
        }

    def list_closures(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        status: str | None = None,
    ) -> tuple[list[dict], int]:
        items, total = self.repo.list_closures(limit=limit, offset=offset, status=status)
        return [self.to_dict(c) for c in items], total

    # ------------------------------------------------------------------ mutación

    def close_week(
        self,
        *,
        week_ref: str | None = None,
        period_start: str | None = None,
        period_end: str | None = None,
        observaciones: str | None = None,
        usuario: str = "SISTEMA",
    ) -> dict:
        """Cierra la semana contable y guarda una foto del resultado."""
        inicio, fin = self._resolver_rango(week_ref, period_start, period_end)
        existente = self.repo.get_by_range(inicio.isoformat(), fin.isoformat())
        if existente and existente.status == PeriodClosureStatus.CLOSED:
            raise PeriodServiceError(
                f"La semana {inicio} → {fin} ya está cerrada.",
                "ALREADY_CLOSED",
            )

        resumen = self._build_summary(inicio, fin)
        closure = self.repo.upsert(
            period_start=inicio.isoformat(),
            period_end=fin.isoformat(),
            status=PeriodClosureStatus.CLOSED,
            summary_json=json.dumps(resumen, ensure_ascii=False),
            observaciones=observaciones,
            closed_by=usuario,
        )
        self.audit.log(
            "PERIODO_CERRADO",
            "PeriodClosure",
            str(closure.id),
            valor_anterior=PeriodClosureStatus.OPEN,
            valor_nuevo=f"{inicio} → {fin}",
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(closure)
        return self.to_dict(closure)

    def reopen(
        self,
        *,
        motivo: str,
        week_ref: str | None = None,
        period_start: str | None = None,
        period_end: str | None = None,
        usuario: str = "SISTEMA",
    ) -> dict:
        """Reabre una semana cerrada; siempre exige motivo y queda auditado."""
        motivo = (motivo or "").strip()
        if not motivo:
            raise PeriodServiceError(
                "Debe indicar el motivo de la reapertura.",
                "MOTIVO_REQUERIDO",
            )

        inicio, fin = self._resolver_rango(week_ref, period_start, period_end)
        closure = self.repo.get_by_range(inicio.isoformat(), fin.isoformat())
        if not closure or closure.status != PeriodClosureStatus.CLOSED:
            raise PeriodServiceError(
                f"La semana {inicio} → {fin} no está cerrada.",
                "NOT_CLOSED",
            )

        closure = self.repo.upsert(
            period_start=inicio.isoformat(),
            period_end=fin.isoformat(),
            status=PeriodClosureStatus.OPEN,
            reopened_by=usuario,
            motivo_reapertura=motivo,
        )
        self.audit.log(
            "PERIODO_REABIERTO",
            "PeriodClosure",
            str(closure.id),
            valor_anterior=PeriodClosureStatus.CLOSED,
            valor_nuevo=motivo,
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(closure)
        return self.to_dict(closure)

    # ------------------------------------------------------------------ internos

    def _resolver_rango(
        self,
        week_ref: str | None,
        period_start: str | None,
        period_end: str | None,
    ) -> tuple[date, date]:
        if period_start and period_end:
            inicio = date.fromisoformat(period_start[:10])
            fin = date.fromisoformat(period_end[:10])
            if fin < inicio:
                raise PeriodServiceError(
                    "El fin del período no puede ser anterior al inicio.",
                    "INVALID_RANGE",
                )
            return inicio, fin

        referencia = date.fromisoformat(week_ref[:10]) if week_ref else date.today()
        return week_bounds_saturday(referencia)

    def _build_summary(self, inicio: date, fin: date) -> dict:
        from application.services.dashboard_service import DashboardService
        from application.services.ops_service import OpsService

        kpis = DashboardService(self.db).get_kpis(
            period_start=inicio.isoformat(),
            period_end=fin.isoformat(),
        )
        queue = OpsService(self.db).get_queue(
            period_start=inicio.isoformat(),
            period_end=fin.isoformat(),
        )
        return {
            "generado_en": datetime.now().isoformat(timespec="seconds"),
            "kpis": kpis,
            "pendientes_al_cierre": queue.get("conteos", {}),
        }

    def to_dict(self, closure: PeriodClosureModel) -> dict:
        resumen = None
        if closure.summary_json:
            try:
                resumen = json.loads(closure.summary_json)
            except json.JSONDecodeError:
                resumen = None
        return {
            "id": closure.id,
            "period_start": closure.period_start,
            "period_end": closure.period_end,
            "status": closure.status,
            "cerrado": closure.status == PeriodClosureStatus.CLOSED,
            "observaciones": closure.observaciones,
            "closed_by": closure.closed_by,
            "closed_at": closure.closed_at.isoformat() if closure.closed_at else None,
            "reopened_by": closure.reopened_by,
            "reopened_at": closure.reopened_at.isoformat() if closure.reopened_at else None,
            "motivo_reapertura": closure.motivo_reapertura,
            "summary": resumen,
            "created_at": closure.created_at.isoformat() if closure.created_at else "",
        }


def _a_iso(reference: date | datetime | str | None) -> str:
    if reference is None:
        return date.today().isoformat()
    if isinstance(reference, datetime):
        return reference.date().isoformat()
    if isinstance(reference, date):
        return reference.isoformat()
    return str(reference)[:10]
