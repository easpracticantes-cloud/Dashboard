"""Utilidades de período contable (semana sábado–viernes)."""

from __future__ import annotations

from datetime import date, datetime, timedelta


def week_bounds_saturday(reference: date | None = None) -> tuple[date, date]:
    """Devuelve inicio (sábado) y fin (viernes) de la semana contable."""
    ref = reference or date.today()
    days_since_sat = (ref.weekday() - 5) % 7
    start = ref - timedelta(days=days_since_sat)
    end = start + timedelta(days=6)
    return start, end


def month_bounds(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    if month == 12:
        end = date(year, 12, 31)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)
    return start, end


def year_bounds(year: int) -> tuple[date, date]:
    return date(year, 1, 1), date(year, 12, 31)


def resolve_period(
    *,
    period_start: str | None = None,
    period_end: str | None = None,
    week_ref: str | None = None,
    mes: int | None = None,
    anio: int | None = None,
) -> tuple[datetime, datetime, str]:
    """Resuelve rango datetime [inicio, fin] y etiqueta legible."""
    if period_start and period_end:
        start = datetime.fromisoformat(period_start[:10])
        end = datetime.fromisoformat(period_end[:10]).replace(hour=23, minute=59, second=59)
        label = f"{start.date()} → {end.date()}"
        return start, end, label

    if mes and anio:
        d0, d1 = month_bounds(anio, mes)
        start = datetime.combine(d0, datetime.min.time())
        end = datetime.combine(d1, datetime.max.time().replace(microsecond=0))
        return start, end, f"{mes:02d}/{anio}"

    if anio:
        d0, d1 = year_bounds(anio)
        start = datetime.combine(d0, datetime.min.time())
        end = datetime.combine(d1, datetime.max.time().replace(microsecond=0))
        return start, end, str(anio)

    ref = date.fromisoformat(week_ref[:10]) if week_ref else date.today()
    d0, d1 = week_bounds_saturday(ref)
    start = datetime.combine(d0, datetime.min.time())
    end = datetime.combine(d1, datetime.max.time().replace(microsecond=0))
    return start, end, f"Semana {d0} → {d1}"


def recent_weeks(count: int = 8, reference: date | None = None) -> list[dict]:
    """Lista semanas contables recientes para selector UI."""
    ref = reference or date.today()
    weeks: list[dict] = []
    current_start, current_end = week_bounds_saturday(ref)
    for i in range(count):
        start = current_start - timedelta(days=7 * i)
        end = start + timedelta(days=6)
        weeks.append(
            {
                "start": start.isoformat(),
                "end": end.isoformat(),
                "label": f"{start.strftime('%d/%m')} – {end.strftime('%d/%m/%Y')}",
                "current": i == 0,
            }
        )
    return weeks
