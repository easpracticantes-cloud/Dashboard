"""Heurísticas colombianas sobre texto OCR para reforzar extracción de facturas físicas."""

from __future__ import annotations

import re
from typing import Any


_NIT_RE = re.compile(
    r"(?:N\.?\s*I\.?\s*T\.?|NIT|CC|C\.C\.|RUT)\s*[:#]?\s*([\d]{6,12}[\s\-]?[\d]?)",
    re.IGNORECASE,
)
_NIT_BARE_RE = re.compile(r"\b(\d{8,10}[\-]?\d)\b")

# Prefijos reales de factura (Flypass, POS, DIAN, etc.) — máxima prioridad
_FACTURA_STRONG_RE = re.compile(
    r"\b("
    r"(?:FPFL|FPOS|FV\s*POS|FE\s*POS|FVPOS|FEPOS|FE-E|FVE|FE|FV|CDC|FAC|FACT|INV)"
    r"\s*[-]?\s*\d{3,14}"
    r")\b",
    re.IGNORECASE,
)

# Etiquetas explícitas de número de factura / documento
_FACTURA_LABELED_RE = re.compile(
    r"(?:factura(?:\s+electr[oó]nica)?(?:\s+de\s+venta)?|"
    r"cuenta\s+de\s+cobro|"
    r"n[uú]mero\s+(?:de\s+)?(?:factura|documento|documento\s+soporte)|"
    r"prefijo\s+y\s+consecutivo|"
    r"invoice\s*(?:no\.?|number|#)|"
    r"bill\s*#)"
    r"\s*(?:n[uú]mero|no\.?|nro\.?|n°|nº|#)?\s*[:.\-]?\s*"
    r"([A-Z]{0,8}[\-]?\d[\w\-/]{2,24})",
    re.IGNORECASE,
)

# Fallback: No./Nro cerca de factura (no genérico "número" suelto)
_FACTURA_NO_RE = re.compile(
    r"(?:factura|documento)\s*(?:n[uú]m(?:ero)?|no\.?|nro\.?|n°|nº)\s*[:.]?\s*"
    r"([A-Z]{1,8}[\s\-/]?\d{3,14})",
    re.IGNORECASE,
)

_INVOICE_EN_RE = re.compile(
    r"(?:invoice\s*(?:no\.?|number|#)|bill\s*#)\s*[:.]?\s*([A-Z0-9][\w\-/]{2,20})",
    re.IGNORECASE,
)

# Contexto de TURNO / caja / mesa — NUNCA es número de factura
_TURNO_CONTEXT_RE = re.compile(
    r"(?:turno|caja|mesa|puesto|taquilla|ventana|terminal|atenci[oó]n|"
    r"orden\s+de\s+servicio|ticket\s+turno|n[uú]mero\s+de\s+turno)"
    r"\s*(?:n[uú]m(?:ero)?|no\.?|nro\.?|n°|nº|#|:)?\s*"
    r"([A-Z0-9][\w\-/]{0,14})",
    re.IGNORECASE,
)

_TURNO_VALUE_RE = re.compile(
    r"^(?:TURNO|TNO|TRN)[\s\-/]?\d{1,6}$",
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
_CUFE_RE = re.compile(r"\b([a-fA-F0-9]{40,96})\b")
_RUT_RE = re.compile(r"(?:RUT)\s*[:#]?\s*([\d]{6,12}[\s\-]?[\d]?)", re.IGNORECASE)
_OC_RE = re.compile(
    r"(?:orden\s+de\s+compra|o\.?\s*c\.?|oc|purchase\s+order)\s*[:#]?\s*([A-Z]{0,6}\d{3,10})",
    re.IGNORECASE,
)
_PROVEEDOR_RE = re.compile(
    r"(?:raz[oó]n\s*social|proveedor|emisor|vendedor|seller)\s*[:#]?\s*([^\n\r]{3,80})",
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


def _clean_invoice_number(raw: str | None) -> str | None:
    if not raw:
        return None
    num = re.sub(r"\s+", "", str(raw).strip(" .:|-"))
    if len(num) < 3:
        return None
    if num.lower().startswith("de"):
        return None
    return num.upper() if any(c.isalpha() for c in num) else num


def looks_like_turno(value: str | None, *, ocr_text: str | None = None) -> bool:
    """True si el valor parece turno/caja/mesa y NO un número de factura DIAN/POS."""
    cleaned = _clean_invoice_number(value)
    if not cleaned:
        return True

    if _TURNO_VALUE_RE.match(cleaned):
        return True

    # Prefijos fuertes de factura → nunca turno
    if re.match(
        r"^(?:FPFL|FPOS|FVPOS|FEPOS|FE-E|FVE|FE|FV|CDC|FAC|FACT|INV)[\-]?\d{3,}$",
        cleaned,
        re.IGNORECASE,
    ):
        return False

    digits = re.sub(r"\D", "", cleaned)
    # Turnos suelen ser cortos (1–4 dígitos) sin prefijo de factura
    if cleaned.isdigit() and len(cleaned) <= 4:
        return True
    if len(digits) <= 4 and not re.search(r"[A-Za-z]{2,}", cleaned):
        return True

    if ocr_text:
        # Si aparece como valor de "Turno …" en el OCR, rechazar
        for m in _TURNO_CONTEXT_RE.finditer(ocr_text):
            cand = _clean_invoice_number(m.group(1))
            if cand and cand.upper() == cleaned.upper():
                return True
            # También comparar solo dígitos
            if cand and re.sub(r"\D", "", cand) == digits and digits:
                return True

    return False


def _score_invoice_candidate(value: str, *, source: str) -> int:
    cleaned = _clean_invoice_number(value)
    if not cleaned or looks_like_turno(cleaned):
        return -1
    score = 0
    upper = cleaned.upper()
    if re.match(r"^(?:FPFL|FPOS|FVPOS|FEPOS)\d", upper.replace("-", "")):
        score += 100
    elif re.match(r"^(?:FE|FV|CDC|FAC|FACT|INV)[\-]?\d{3,}", upper):
        score += 80
    elif re.search(r"[A-Z]{2,}\-?\d{4,}", upper):
        score += 60
    elif re.search(r"[A-Z]+\d+", upper):
        score += 40
    else:
        score += 10

    digits = re.sub(r"\D", "", cleaned)
    if len(digits) >= 6:
        score += 20
    elif len(digits) >= 4:
        score += 10

    if source == "strong":
        score += 30
    elif source == "labeled":
        score += 20
    elif source == "fallback":
        score += 5
    return score


def _collect_turno_values(text: str) -> set[str]:
    out: set[str] = set()
    for m in _TURNO_CONTEXT_RE.finditer(text or ""):
        cand = _clean_invoice_number(m.group(1))
        if cand:
            out.add(cand.upper())
            digits = re.sub(r"\D", "", cand)
            if digits:
                out.add(digits)
    return out


def extract_best_invoice_number(ocr_text: str) -> str | None:
    """Elige el mejor número de factura; excluye turnos/caja/mesa."""
    text = ocr_text or ""
    turno_vals = _collect_turno_values(text)
    candidates: list[tuple[int, str]] = []

    patterns: list[tuple[str, re.Pattern[str]]] = [
        ("strong", _FACTURA_STRONG_RE),
        ("labeled", _FACTURA_LABELED_RE),
        ("labeled", _INVOICE_EN_RE),
        ("fallback", _FACTURA_NO_RE),
    ]
    for source, pattern in patterns:
        for m in pattern.finditer(text):
            raw = m.group(1)
            cleaned = _clean_invoice_number(raw)
            if not cleaned:
                continue
            if cleaned.upper() in turno_vals or re.sub(r"\D", "", cleaned) in turno_vals:
                continue
            if looks_like_turno(cleaned, ocr_text=text):
                continue
            # Evitar capturar la palabra TURNO misma
            if "TURNO" in cleaned.upper() and not re.search(r"[A-Z]{2,}\d{4,}", cleaned.upper()):
                continue
            score = _score_invoice_candidate(cleaned, source=source)
            if score >= 0:
                candidates.append((score, cleaned))

    if not candidates:
        return None
    candidates.sort(key=lambda x: (-x[0], -len(x[1])))
    return candidates[0][1]


def extract_invoice_hints(ocr_text: str) -> dict[str, Any]:
    """Extrae candidatos tipados desde OCR (sin inventar)."""
    text = ocr_text or ""
    hints: dict[str, Any] = {}

    m = _NIT_RE.search(text) or _RUT_RE.search(text)
    if m:
        hints["nit_o_identificacion"] = re.sub(r"\s+", "", m.group(1))
    else:
        m2 = _NIT_BARE_RE.search(text)
        if m2:
            hints["nit_o_identificacion"] = m2.group(1)

    numero = extract_best_invoice_number(text)
    if numero:
        hints["numero_factura"] = numero

    m = _COMPRA_RE.search(text) or _OC_RE.search(text)
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

    cufe = _CUFE_RE.search(text)
    if cufe:
        hints["_cufe"] = cufe.group(1)

    return {k: v for k, v in hints.items() if v is not None and v != ""}


def merge_hints_into_extraction(
    extracted: dict[str, Any],
    hints: dict[str, Any],
    *,
    ocr_text: str | None = None,
) -> dict[str, Any]:
    """Rellena vacíos y corrige totales IA ×10 típicos al mal parsear 14,300.00.

    Si la IA puso un TURNO como numero_factura y el OCR tiene un FPFL/FPOS/FE real,
    reemplaza el valor de la IA.
    """
    out = dict(extracted or {})
    ocr_blob = ocr_text or ""

    for key, value in hints.items():
        if key.startswith("_"):
            continue
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
        if key in {"total", "subtotal", "impuesto"} and isinstance(value, (int, float)):
            corrected = _prefer_ocr_amount(current, value)
            if corrected is not None:
                out[key] = corrected
        if key == "numero_factura" and isinstance(value, str):
            cur = str(current)
            # IA tomó turno / número corto → preferir candidato OCR de factura
            if looks_like_turno(cur, ocr_text=ocr_blob) and not looks_like_turno(value, ocr_text=ocr_blob):
                out[key] = value
            elif _score_invoice_candidate(value, source="strong") >= 90 and _score_invoice_candidate(
                cur, source="fallback"
            ) < 90:
                out[key] = value

    # Último filtro: si el número final sigue pareciendo turno y hay hint bueno, usa hint
    hint_num = hints.get("numero_factura")
    final_num = out.get("numero_factura")
    if hint_num and looks_like_turno(str(final_num) if final_num else None, ocr_text=ocr_blob) and not looks_like_turno(
        str(hint_num), ocr_text=ocr_blob
    ):
        out["numero_factura"] = hint_num
        asumidos = list(out.get("campos_asumidos") or [])
        asumidos.append(
            {
                "campo": "numero_factura",
                "valor": hint_num,
                "razon": "Se descartó un valor tipo TURNO; se usó el número de factura del OCR.",
            }
        )
        out["campos_asumidos"] = asumidos
        amb = list(out.get("ambiguedades") or [])
        amb.append(
            {
                "campo": "numero_factura",
                "opciones": [str(final_num), str(hint_num)],
                "elegido": str(hint_num),
                "motivo": "El valor previo coincidía con TURNO/caja, no con factura.",
            }
        )
        out["ambiguedades"] = amb

    if hints:
        out["_ocr_hints"] = {k: v for k, v in hints.items() if not str(k).startswith("_")}
    return out


def _prefer_ocr_amount(ai_val: Any, ocr_val: float) -> float | None:
    """Si la IA está a ×10/×100 del OCR (bug 14300.0→143000), quédate con OCR."""
    try:
        ai = float(ai_val)
        ocr = float(ocr_val)
    except (TypeError, ValueError):
        return None
    if ocr <= 0:
        return None
    if abs(ai - ocr) <= max(1.0, ocr * 0.02):
        return ocr
    for factor in (10, 100, 1000):
        if abs(ai - ocr * factor) <= max(1.0, ocr * factor * 0.02):
            return ocr
    return None
