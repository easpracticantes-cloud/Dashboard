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


# Prefijo de factura + número. Cubre FE-6920, FPOS-65985, FLYP-11108120, HIN-36005, FEC-2104.
_INVOICE_TOKEN = re.compile(r"([A-Z]{1,8}-?\d{3,}(?:[A-Z]\d[A-Z])?)", re.IGNORECASE)


def invoice_tokens(value: str | None) -> list[str]:
    """Códigos de factura incrustados en un texto (OCR, contramarcado, Excel)."""
    if not value:
        return []
    return [m.group(1) for m in _INVOICE_TOKEN.finditer(str(value))]


def invoice_numbers_match(a: str | None, b: str | None) -> bool:
    """True si dos textos apuntan al mismo número de factura, aunque uno traiga basura OCR."""
    if not a or not b:
        return False
    na, nb = normalize_id(a), normalize_id(b)
    if na and na == nb:
        return True
    keys_a = {normalize_id(t) for t in invoice_tokens(a)}
    keys_b = {normalize_id(t) for t in invoice_tokens(b)}
    if na:
        keys_a.add(na)
    if nb:
        keys_b.add(nb)
    keys_a.discard("")
    keys_b.discard("")
    if keys_a & keys_b:
        return True
    # FE-6920 dentro de "12092026 FE-6920 JAVIER $84000"
    for short, long_ in ((na, nb), (nb, na)):
        if len(short) >= 5 and short in long_:
            return True
    return False


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
