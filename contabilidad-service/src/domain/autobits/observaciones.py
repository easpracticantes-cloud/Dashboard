"""Interpreta OBSERVACIONES (y señales) del Excel Autobits para el cruce."""

from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

from domain.enums import CrossingStatus


def _fold(text: str) -> str:
    """Minúsculas sin tildes, espacios colapsados."""
    nfkd = unicodedata.normalize("NFKD", text or "")
    plain = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", plain.lower()).strip()


_EMPTY = {"", "-", "--", "n/a", "na", "ninguna", "ninguno", "sin observaciones", "s/o"}

# Cabeceras que a veces quedan como valor por Excel mal leído
_HEADER_LEAKS = {"observaciones", "observacion", "si", "no", "total", "moneda"}

# Pagado / liquidado en caja o banco
_PAGADO = (
    "efectivo",
    "en fisico",
    "pago en efectivo",
    "paso en efectivo",
    "pagado en efectivo",
    "se pago en efectivo",
    "se pago",
    "pagado",
    "ya pago",
    "ya se pago",
    "transferencia",
    "consignado",
    "consignacion",
    "bancolombia",
    "nequi",
    "daviplata",
)

# Ya hay soporte documental (CDC/factura) aunque falte fecha de pago formal
_APROBADO = (
    "cdc enviada",
    "cdc enviado",
    "cuenta de cobro enviada",
    "factura enviada",
    "fv enviada",
)

_PENDIENTE = (
    "pendiente",
    "pend.",
    "por pagar",
    "sin pagar",
    "falta pagar",
    "no pagado",
)

_SUBSANACION = (
    "corregir",
    "coregir",  # typo frecuente en notas
    "subsanar",
    "devolver",
    "anular",
)


def _clean_obs_value(val: Any) -> str | None:
    if val is None or val == "":
        return None
    text = str(val).strip()
    if not text or _fold(text) in _EMPTY or _fold(text) in _HEADER_LEAKS:
        return None
    return text


def _columna_index(key: str) -> int | None:
    m = re.match(r"^columna[_\s]?(\d+)$", _fold(key).replace(" ", "_"))
    return int(m.group(1)) if m else None


def extract_observaciones_from_raw(raw: dict[str, Any] | None) -> str | None:
    if not raw:
        return None
    for key, val in raw.items():
        folded = _fold(str(key))
        if "observacion" in folded:
            return _clean_obs_value(val)

    # Export Autobits sin encabezados reales: últimas columnas = SI | NO | OBSERVACIONES
    indexed = [(idx, key) for key in raw if (idx := _columna_index(str(key))) is not None]
    if indexed:
        indexed.sort(key=lambda x: x[0], reverse=True)
        for _, key in indexed[:3]:
            cleaned = _clean_obs_value(raw.get(key))
            if cleaned and _fold(cleaned) not in {"x", "si", "no"}:
                return cleaned
    return None


def extract_estado_compra_from_raw(raw: dict[str, Any] | None) -> str | None:
    if not raw:
        return None
    for key, val in raw.items():
        folded = _fold(str(key))
        if "estado de la compra" in folded or folded == "estado compra":
            return _clean_obs_value(val)
    return None


def observaciones_from_record(record: Any) -> str | None:
    """Lee observaciones del registro Autobits (columna o raw_json)."""
    direct = getattr(record, "observaciones", None)
    if direct and str(direct).strip():
        cleaned = _clean_obs_value(direct)
        if cleaned:
            return cleaned
    raw_json = getattr(record, "raw_json", None)
    if not raw_json:
        return None
    try:
        raw = json.loads(raw_json) if isinstance(raw_json, str) else raw_json
    except json.JSONDecodeError:
        return None
    return extract_observaciones_from_raw(raw if isinstance(raw, dict) else None)


def estado_compra_from_record(record: Any) -> str | None:
    direct = getattr(record, "estado_compra", None)
    if direct and str(direct).strip():
        return str(direct).strip()
    raw_json = getattr(record, "raw_json", None)
    if not raw_json:
        return None
    try:
        raw = json.loads(raw_json) if isinstance(raw_json, str) else raw_json
    except json.JSONDecodeError:
        return None
    return extract_estado_compra_from_raw(raw if isinstance(raw, dict) else None)


def infer_crossing_status(
    observaciones: str | None,
    *,
    estado_compra: str | None = None,
) -> tuple[str, str | None]:
    """
    Deriva estado de cruce desde notas Autobits.

    Returns:
        (CrossingStatus, texto_observaciones a guardar)
    """
    obs = _clean_obs_value(observaciones)
    text = _fold(obs or "")

    if not text:
        return CrossingStatus.PENDIENTE, obs

    has_pagado = any(k in text for k in _PAGADO)
    has_aprobado = any(k in text for k in _APROBADO)
    has_pendiente = any(k in text for k in _PENDIENTE)
    has_subs = any(k in text for k in _SUBSANACION)

    if has_subs and not has_pagado:
        return CrossingStatus.SUBSANACION, obs
    if has_pagado:
        return CrossingStatus.PAGADO, obs
    if has_aprobado and not has_pendiente:
        return CrossingStatus.APROBADO, obs
    if has_pendiente:
        return CrossingStatus.PENDIENTE, obs

    folded_estado = _fold(estado_compra or "")
    if folded_estado in {"anulado", "cancelado", "cancelada"}:
        return CrossingStatus.SUBSANACION, obs or estado_compra

    # Otras notas (viáticos, aclaraciones): se muestran, siguen pendientes de cierre formal
    return CrossingStatus.PENDIENTE, obs


def resolve_crossing_estado(
    *,
    factura_cdc: str | None,
    fecha_pago: str | None,
    observaciones: str | None,
    estado_compra: str | None = None,
) -> str:
    """Prioridad: fecha de pago → factura/CDC → inferencia Autobits."""
    if (fecha_pago or "").strip():
        return CrossingStatus.PAGADO
    if (factura_cdc or "").strip():
        return CrossingStatus.APROBADO
    estado, _ = infer_crossing_status(observaciones, estado_compra=estado_compra)
    return estado
