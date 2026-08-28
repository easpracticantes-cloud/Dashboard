"""Tests utilidades de período."""

import sys
from datetime import date
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from domain.utils.period_utils import month_bounds, resolve_period, week_bounds_saturday


def test_week_bounds_saturday():
    # 2026-08-22 is Saturday
    start, end = week_bounds_saturday(date(2026, 8, 22))
    assert start == date(2026, 8, 22)
    assert end == date(2026, 8, 28)  # Friday

    # 2026-08-28 is Friday — same week
    start2, end2 = week_bounds_saturday(date(2026, 8, 28))
    assert start2 == date(2026, 8, 22)
    assert end2 == date(2026, 8, 28)


def test_resolve_period_month():
    start, end, label = resolve_period(mes=8, anio=2026)
    assert start.date() == date(2026, 8, 1)
    assert end.date() == date(2026, 8, 31)
    assert "08/2026" in label
