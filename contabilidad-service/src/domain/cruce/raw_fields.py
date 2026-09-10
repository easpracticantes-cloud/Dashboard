"""Lee columnas extra del raw_json de Autobits sin inventar valores."""

from __future__ import annotations

import json
from typing import Any

from domain.cruce.fields import fold
from domain.utils.money import to_money_or_none

_REF_ALIASES = (
    "referencia (orden de compra)",
    "referencia",
    "ref.",
    "ref",
)
_TERC_ALIASES = (
    "precio terceros",
    "precio tercero",
)
_COMPRADOR_ALIASES = (
    "comprador (orden de compra)",
    "comprador",
)
_VENDEDOR_ALIASES = (
    "vendedor (reserva)",
    "vendedor",
    "nombre cliente (reserva)",
)
_CANTIDAD_ALIASES = (
    "cantidad",
)


def parse_raw(record: Any) -> dict:
    raw_json = getattr(record, "raw_json", None) if record is not None else None
    if not raw_json:
        return {}
    try:
        data = json.loads(raw_json) if isinstance(raw_json, str) else raw_json
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def raw_text(raw: dict, aliases: tuple[str, ...]) -> str | None:
    if not raw:
        return None
    folded = {fold(k): v for k, v in raw.items()}
    for alias in aliases:
        val = folded.get(alias)
        if val is None or val == "":
            continue
        text = str(val).strip()
        if text:
            return text
    return None


def extras_from_record(record: Any) -> dict:
    raw = parse_raw(record)
    cantidad = to_money_or_none(raw_text(raw, _CANTIDAD_ALIASES))
    return {
        "referencia_oc": raw_text(raw, _REF_ALIASES),
        "precio_terceros": to_money_or_none(raw_text(raw, _TERC_ALIASES)),
        "comprador": raw_text(raw, _COMPRADOR_ALIASES),
        "vendedor": raw_text(raw, _VENDEDOR_ALIASES),
        "cantidad": cantidad,
    }
