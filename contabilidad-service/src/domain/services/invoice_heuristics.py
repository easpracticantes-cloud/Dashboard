"""Heurísticas colombianas sobre texto OCR para reforzar extracción de facturas físicas."""

from __future__ import annotations

import re
from typing import Any


_NIT_RE = re.compile(
    r"(?:N\.?\s*I\.?\s*T\.?|NIT|CC|C\.C\.|RUT)\s*[:#]?\s*([\d]{6,12}[\s\-]?[\d]?)",
    re.IGNORECASE,
)
_NIT_BARE_RE = re.compile(r"\b(\d{8,10}[\-]?\d)\b")
_FACTURA_RE = re.compile(
    r"(?:factura(?:\s+de\s+venta)?|cuenta\s+de\s+cobro|cdc|fpos|fv\s*pos|fe\s*pos|fe-?e?|n[uú]mero)\s*"
    r"(?:electr[oó]nica)?\s*(?:n[uú]mero|no\.?|nro\.?|n°|nº|#|-)?\s*[:.]?\s*"
    r"([A-Z]{0,8}[\-]?\d[\w\-/]{1,20})",
    re.IGNORECASE,
)
_FACTURA_POS_RE = re.compile(
    r"\b((?:FPOS|FV\s*POS|FE\s*POS|FVPOS|FEPOS|FE-E|FE|FV|CDC)\s*[-]?\s*\d{2,8})\b",
    re.IGNORECASE,
)
_FACTURA_NO_RE = re.compile(
    r"(?:n[uú]m(?:ero)?|no\.?|nro\.?|n°|nº)\s*[:.]?\s*([A-Z]{1,6}[\s\-/]?\d{3,10})",
    re.IGNORECASE,
)
_COMPRA_RE = re.compile(r"\b(COM\s*\d{4,8}|COT\s*\d{4,8})\b", re.IGNORECASE)
_RESERVA_RE = re.compile(r"\b(EAS\s*\d{4,8})\b", re.IGNORECASE)
_FECHA_RE = re.compile(
    r"(?:fecha|f\.?\s*emisi[oó]n|expedici[oó]n)\s*[:#]?\s*"
    r"(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})",
    re.IGNORECASE,
)
_FECHA_BARE_RE = re.compile(r"\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\b")
_TOTAL_RE = re.compile(
    r"(?:total\s+a\s+pagar|valor\s+total|gran\s+total|neto\s+a\s+pagar|(?<![Ss]ub)(?<![a-zA-Z])total(?![a-zA-Z]))"
    r"[^\d$]{0,12}\$?\s*"
    r"([\d]{1,3}(?:\.\d{3})+(?:,\d{2})?|[\d]{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+(?:[.,]\d{2})?)",
    re.IGNORECASE,
)
_IVA_RE = re.compile(
    r"(?:I\.?\s*V\.?\s*A\.?|impuesto)(?:\s*\d+\s*%)?(?:\s*\(\s*\d+\s*%\s*\))?"
    r"[^\d$]{0,24}\$?\s*"
    r"([\d]{1,3}(?:\.\d{3})+(?:,\d{2})?|[\d]+[.,]\d{2})",
    re.IGNORECASE,
)
_SUBTOTAL_RE = re.compile(
    r"(?:sub\s*total|base\s*(?:gravable|imponible))"
    r"[^\d$]{0,12}\$?\s*"
    r"([\d]{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:[.,]\d{2})?)",
    re.IGNORECASE,
)
_PROVEEDOR_RE = re.compile(
    r"(?:raz[oó]n\s*social|proveedor|emisor|vendedor)\s*[:#]?\s*([^\n\r]{3,80})",
    re.IGNORECASE,
)


def _parse_money(raw: str | None) -> float | None:
    if not raw:
        return None
    s = raw.strip().replace(" ", "").replace("$", "")
    if not s:
        return None
    # 1.234.567,89 → 1234567.89 ; 1,234,567.89 → 1234567.89
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        parts = s.split(",")
        if len(parts[-1]) == 2:
            s = "".join(parts[:-1]).replace(".", "") + "." + parts[-1]
        else:
            s = s.replace(",", "")
    elif "." in s:
        parts = s.split(".")
        # Formato CO: 119.000 o 1.250.000 (puntos de miles)
        if all(p.isdigit() for p in parts) and (
            len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3)
        ):
            s = "".join(parts)
        elif s.count(".") > 1:
            s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def _norm_fecha(raw: str | None) -> str | None:
    if not raw:
        return None
    parts = re.split(r"[/\-.]", raw.strip())
    if len(parts) != 3:
        return raw.strip()
    d, m, y = parts
    if len(y) == 2:
        y = f"20{y}"
    try:
        return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
    except ValueError:
        return raw.strip()


def extract_invoice_hints(ocr_text: str) -> dict[str, Any]:
    """Extrae candidatos tipados desde OCR (sin inventar)."""
    text = ocr_text or ""
    hints: dict[str, Any] = {}

    m = _NIT_RE.search(text)
    if m:
        hints["nit_o_identificacion"] = re.sub(r"\s+", "", m.group(1))
    else:
        m2 = _NIT_BARE_RE.search(text)
        if m2:
            hints["nit_o_identificacion"] = m2.group(1)

    m = _FACTURA_POS_RE.search(text) or _FACTURA_RE.search(text) or _FACTURA_NO_RE.search(text)
    if m:
        num = re.sub(r"\s+", " ", m.group(1)).strip()
        if len(num) >= 3 and not num.lower().startswith("de"):
            hints["numero_factura"] = num

    m = _COMPRA_RE.search(text)
    if m:
        hints["compra"] = re.sub(r"\s+", "", m.group(1)).upper()
    m = _RESERVA_RE.search(text)
    if m:
        hints["reserva"] = re.sub(r"\s+", "", m.group(1)).upper()

    m = _FECHA_RE.search(text) or _FECHA_BARE_RE.search(text)
    if m:
        hints["fecha_emision"] = _norm_fecha(m.group(1))

    # Preferir el último TOTAL (suele ser el de pie de página)
    totals = list(_TOTAL_RE.finditer(text))
    if totals:
        hints["total"] = _parse_money(totals[-1].group(1))

    m = _IVA_RE.search(text)
    if m:
        hints["impuesto"] = _parse_money(m.group(1))

    m = _SUBTOTAL_RE.search(text)
    if m:
        hints["subtotal"] = _parse_money(m.group(1))

    m = _PROVEEDOR_RE.search(text)
    if m:
        nombre = re.sub(r"\s+", " ", m.group(1)).strip(" -:|")
        if len(nombre) >= 3:
            hints["proveedor"] = nombre[:120]

    return {k: v for k, v in hints.items() if v is not None and v != ""}


def merge_hints_into_extraction(extracted: dict[str, Any], hints: dict[str, Any]) -> dict[str, Any]:
    """Rellena solo campos vacíos/nulos del JSON IA con heurísticas OCR."""
    out = dict(extracted or {})
    for key, value in hints.items():
        current = out.get(key)
        empty = current is None or current == "" or current == {}
        if empty:
            out[key] = value
            continue
        if key == "proveedor" and isinstance(current, dict) and not current.get("nombre") and isinstance(value, str):
            current = dict(current)
            current["nombre"] = value
            out[key] = current
        if key == "nit_o_identificacion" and isinstance(out.get("proveedor"), dict):
            prov = dict(out["proveedor"])
            if not prov.get("nit"):
                prov["nit"] = value
                out["proveedor"] = prov
    if hints:
        out["_ocr_hints"] = hints
    return out
