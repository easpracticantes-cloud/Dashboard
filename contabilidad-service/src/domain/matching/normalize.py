"""Utilidades de normalización para matching."""

import re
import unicodedata
from decimal import Decimal

from domain.utils.money import to_money
from domain.utils.money import values_close as money_values_close


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", str(value).strip().lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text)


def normalize_id(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]", "", normalize_text(value))


def normalize_nit(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^0-9]", "", str(value))


def names_similar(a: str | None, b: str | None) -> bool:
    na = normalize_text(a)
    nb = normalize_text(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    if na in nb or nb in na:
        return True
    na_words = set(na.split())
    nb_words = set(nb.split())
    if not na_words or not nb_words:
        return False
    overlap = len(na_words & nb_words) / max(len(na_words), len(nb_words))
    return overlap >= 0.6


def values_close(a: float | None, b: float | None, tolerance_pct: float = 1.0) -> bool:
    """Compara importes con tolerancia porcentual, en Decimal (sin ruido binario)."""
    return money_values_close(
        a,
        b,
        rel=Decimal(str(tolerance_pct)) / Decimal("100"),
        abs_tol=Decimal("0"),
    )


def value_difference(a: float | None, b: float | None) -> Decimal | None:
    """Diferencia contable exacta entre dos importes."""
    if a is None or b is None:
        return None
    return to_money(a) - to_money(b)
