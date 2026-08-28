"""Clave de negocio para reconciliar filas Autobits entre importaciones."""

from __future__ import annotations

import hashlib
import re
from typing import Any


def _norm(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip().upper()
    return re.sub(r"\s+", "", text)


def autobits_business_key(
    nit: str | None,
    numero_compra: str | None,
    numero_reserva: str | None,
) -> str:
    """Identifica una fila de compra/reserva sin depender del id de importación."""
    parts = "|".join(_norm(p) for p in (nit, numero_compra, numero_reserva))
    if parts == "||":
        return ""
    return hashlib.sha256(parts.encode()).hexdigest()


def business_key_from_record(record: Any) -> str:
    return autobits_business_key(
        getattr(record, "nit", None),
        getattr(record, "numero_compra", None),
        getattr(record, "numero_reserva", None),
    )
