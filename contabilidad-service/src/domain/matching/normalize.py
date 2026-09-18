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


def nits_match(a: str | None, b: str | None) -> bool:
    """Compara NIT colombiano con o sin dígito de verificación."""
    na, nb = normalize_nit(a), normalize_nit(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    shorter, longer = (na, nb) if len(na) <= len(nb) else (nb, na)
    # 900123456 vs 9001234561 (DV al final)
    if len(shorter) >= 6 and longer.startswith(shorter) and len(longer) - len(shorter) <= 1:
        return True
    return False


def parse_date(value) -> object:
    """Normaliza fechas de factura/Excel a date o None."""
    from datetime import date, datetime

    if value is None or str(value).strip() == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    texto = str(value).strip()[:19]
    for fmt in (
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
        "%d.%m.%Y",
        "%Y%m%d",
        "%d/%m/%y",
        "%d-%m-%y",
        "%d.%m.%y",
    ):
        try:
            piece = texto[:8] if fmt == "%Y%m%d" else texto[:10]
            return datetime.strptime(piece, fmt).date()
        except ValueError:
            continue
    # "12092026 FE-6920…" → ddmmyyyy al inicio
    digits = re.sub(r"\D", "", texto)[:8]
    if len(digits) == 8:
        for fmt in ("%d%m%Y", "%Y%m%d"):
            try:
                return datetime.strptime(digits, fmt).date()
            except ValueError:
                continue
    return None


def date_proximity(a: str | None, b: str | None) -> tuple[int, str | None]:
    """Puntos y razón según cercanía de fechas (mismo día, ±3 días, mismo mes)."""
    da, db = parse_date(a), parse_date(b)
    if not da or not db:
        return 0, None
    delta = abs((da - db).days)
    if delta == 0:
        return 18, "fecha"
    if delta <= 3:
        return 10, "fecha_cercana"
    if da.year == db.year and da.month == db.month:
        return 4, "fecha_mes"
    return 0, None


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
