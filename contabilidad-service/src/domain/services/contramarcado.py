"""Contramarcado automático de facturas (determinista).

Formato:
  DDMMAAAA TIPO NUMERO_FACTURA EMPRESA $VALOR COM…

Nunca inventa un COM: si no hay evidencia clara → «COM pendiente».
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from domain.matching.normalize import normalize_id, normalize_text

_COM_RE = re.compile(r"\bCOM\s*0*\d{4,10}\b", re.IGNORECASE)
_COM_PENDIENTE = "COM pendiente"

STATUS_GENERADO = "GENERADO"
STATUS_AMBIGUO = "AMBIGUO"
STATUS_PENDIENTE = "PENDIENTE"
STATUS_ERROR = "ERROR"

SOURCE_INVOICE = "INVOICE"
SOURCE_AUTOBITS = "AUTOBITS"
SOURCE_CROSSING = "CROSSING"
SOURCE_NONE = "NONE"


@dataclass
class ComCandidate:
    com: str
    source: str
    score: float
    reasons: list[str] = field(default_factory=list)
    proveedor: str | None = None
    numero_documento: str | None = None


@dataclass
class ContramarcadoResult:
    value: str
    status: str
    com: str | None
    source: str
    confidence: float
    warning: str | None = None
    candidates: list[dict[str, Any]] = field(default_factory=list)
    tipo: str | None = None
    numero: str | None = None
    empresa: str | None = None
    fecha_ddmmyyyy: str | None = None
    valor_tag: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "value": self.value,
            "status": self.status,
            "com": self.com,
            "source": self.source,
            "confidence": self.confidence,
            "warning": self.warning,
            "candidates": self.candidates,
            "tipo": self.tipo,
            "numero": self.numero,
            "empresa": self.empresa,
            "fecha_ddmmyyyy": self.fecha_ddmmyyyy,
            "valor_tag": self.valor_tag,
        }

    def persist_fields(self) -> dict[str, Any]:
        """Campos planos para extracted_json + columnas document."""
        return {
            "contramarcado": self.value,
            "contramarcadoStatus": self.status,
            "contramarcadoCom": self.com,
            "contramarcadoSource": self.source,
            "contramarcadoConfidence": self.confidence,
            "contramarcadoWarning": self.warning,
            "contramarcadoCandidates": self.candidates,
            "_contramarcado": self.to_dict(),
        }


def normalize_com(raw: str | None) -> str | None:
    if not raw:
        return None
    text = re.sub(r"\s+", "", str(raw).strip().upper())
    if not text:
        return None
    if text in ("COM PENDIENTE", "COMPENDIENTE", "PENDIENTE"):
        return None
    m = re.match(r"^(COM)?0*(\d{4,10})$", text)
    if m:
        return f"COM{m.group(2).zfill(6) if len(m.group(2)) <= 6 else m.group(2)}"
    m2 = re.match(r"^COM0*(\d{4,10})$", text)
    if m2:
        digits = m2.group(1)
        return f"COM{digits.zfill(6) if len(digits) <= 6 else digits}"
    if text.startswith("COM") and re.search(r"\d", text):
        digits = re.sub(r"\D", "", text)
        if len(digits) >= 4:
            return f"COM{digits.zfill(6) if len(digits) <= 6 else digits}"
    return None


def extract_com_from_text(text: str | None) -> str | None:
    if not text:
        return None
    found: list[str] = []
    for m in _COM_RE.finditer(text):
        com = normalize_com(m.group(0))
        if com and com not in found:
            found.append(com)
    if len(found) == 1:
        return found[0]
    if len(found) > 1:
        # Varios COM en el mismo texto → ambigüedad; el orquestador decide
        return None
    return None


def extract_all_coms_from_text(text: str | None) -> list[str]:
    if not text:
        return []
    out: list[str] = []
    for m in _COM_RE.finditer(text):
        com = normalize_com(m.group(0))
        if com and com not in out:
            out.append(com)
    return out


def format_fecha_ddmmyyyy(fecha: str | None) -> str | None:
    if not fecha:
        return None
    raw = str(fecha).strip()
    if not raw:
        return None
    # YYYY-MM-DD or YYYY/MM/DD
    m = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})", raw)
    if m:
        y, mo, d = m.group(1), int(m.group(2)), int(m.group(3))
        return f"{d:02d}{mo:02d}{y}"
    # DD/MM/YYYY or DD-MM-YYYY
    m = re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})", raw)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), m.group(3)
        return f"{d:02d}{mo:02d}{y}"
    # Already DDMMAAAA
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 8:
        return digits
    return None


def normalize_tipo_documento(raw: str | None) -> str:
    t = (raw or "").strip().upper()
    if not t:
        return "FE"
    compact = re.sub(r"[^A-Z0-9]", "", t)
    known = {"FE", "FV", "NC", "ND", "DS", "FC", "FVE", "FCE"}
    if compact in known:
        return "FE" if compact in ("FVE", "FCE", "FV", "FC") else compact
    if "ELECTRON" in t or compact.startswith("FE"):
        return "FE"
    if "CREDITO" in t or compact == "NC":
        return "NC"
    if "DEBITO" in t or compact == "ND":
        return "ND"
    if len(compact) <= 4:
        return compact
    return "FE"


def normalize_empresa(raw: str | None) -> str:
    if not raw:
        return "EMPRESA"
    text = str(raw).strip().upper()
    text = re.sub(r"\b(S\.?\s*A\.?\s*S\.?|S\.?\s*A\.?|LTDA\.?|LLC|INC\.?)\b", "", text)
    text = re.sub(r"[^A-Z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return "EMPRESA"
    # Preferir un token corto reconocible (FLYPASS)
    parts = text.split()
    if len(parts) == 1:
        return parts[0][:40]
    # Si el primero es genérico, usar el más distintivo
    skip = {"DE", "LA", "EL", "LOS", "LAS", "DEL", "Y", "THE"}
    distinctive = [p for p in parts if p not in skip]
    if not distinctive:
        distinctive = parts
    joined = "".join(distinctive) if sum(len(p) for p in distinctive) <= 24 else distinctive[0]
    return joined[:40]


def format_valor_tag(total: Any) -> str | None:
    if total is None or total == "":
        return None
    try:
        from domain.utils.money import money_to_float

        amount = money_to_float(total)
    except Exception:
        try:
            cleaned = re.sub(r"[^\d,.\-]", "", str(total))
            if "," in cleaned and "." in cleaned:
                cleaned = cleaned.replace(".", "").replace(",", ".")
            elif "," in cleaned:
                cleaned = cleaned.replace(",", ".")
            amount = float(cleaned)
        except (TypeError, ValueError):
            return None
    if amount is None:
        return None
    # Entero sin separadores de miles (ej. $21200)
    as_int = int(round(amount))
    return f"${as_int}"


def com_from_extracted(extracted: dict | None, ocr_text: str | None = None) -> tuple[str | None, list[str]]:
    """Prioridad 1: COM explícito en extracción / OCR. Devuelve (com|None, todos_encontrados)."""
    found: list[str] = []
    data = extracted or {}

    for key in ("compra", "com", "orden_compra", "numero_compra"):
        val = data.get(key)
        if isinstance(val, dict):
            val = val.get("numero") or val.get("codigo") or val.get("value")
        com = normalize_com(str(val) if val else None)
        if com and com not in found:
            found.append(com)

    nested = data.get("documento") if isinstance(data.get("documento"), dict) else {}
    for key in ("compra", "com"):
        val = nested.get(key) if nested else None
        com = normalize_com(str(val) if val else None)
        if com and com not in found:
            found.append(com)

    for blob in (
        data.get("observaciones"),
        data.get("concepto_general"),
        data.get("concepto"),
        ocr_text,
    ):
        for com in extract_all_coms_from_text(str(blob) if blob else None):
            if com not in found:
                found.append(com)

    if len(found) == 1:
        return found[0], found
    return None, found


def resolve_com_from_candidates(
    invoice_coms: list[str],
    autobits_candidates: list[ComCandidate],
    *,
    min_score: float = 55.0,
    ambiguity_gap: float = 8.0,
) -> tuple[str | None, str, float, str | None, list[dict[str, Any]]]:
    """
    Decide COM final sin inventar.

    Returns: (com, source, confidence, warning, candidates_payload)
    """
    cand_payload = [
        {
            "com": c.com,
            "source": c.source,
            "score": c.score,
            "reasons": c.reasons,
            "proveedor": c.proveedor,
            "numero_documento": c.numero_documento,
        }
        for c in autobits_candidates
        if c.com
    ]

    # Prioridad 1: único COM en factura
    unique_invoice = list(dict.fromkeys(invoice_coms))
    if len(unique_invoice) == 1:
        return unique_invoice[0], SOURCE_INVOICE, 0.99, None, cand_payload
    if len(unique_invoice) > 1:
        return (
            None,
            SOURCE_NONE,
            0.0,
            "No fue posible identificar automáticamente el COM: varios COM en la factura.",
            [{"com": c, "source": SOURCE_INVOICE, "score": 100.0, "reasons": ["factura"]} for c in unique_invoice]
            + cand_payload,
        )

    # Prioridad 2: Autobits / cruces
    viable = [c for c in autobits_candidates if c.com and c.score >= min_score]
    if not viable:
        return (
            None,
            SOURCE_NONE,
            0.0,
            "No fue posible identificar automáticamente el COM.",
            cand_payload,
        )

    viable.sort(key=lambda c: c.score, reverse=True)
    best = viable[0]
    # Agrupar por COM normalizado
    top_coms: dict[str, ComCandidate] = {}
    for c in viable:
        if c.score < best.score - ambiguity_gap:
            break
        prev = top_coms.get(c.com)
        if not prev or c.score > prev.score:
            top_coms[c.com] = c

    if len(top_coms) > 1:
        return (
            None,
            SOURCE_NONE,
            round(best.score / 100.0, 3),
            "No fue posible identificar automáticamente el COM: varias coincidencias posibles.",
            cand_payload,
        )

    winner = next(iter(top_coms.values()))
    conf = min(0.98, round(winner.score / 100.0, 3))
    return winner.com, winner.source, conf, None, cand_payload


def build_contramarcado_string(
    *,
    fecha_ddmmyyyy: str | None,
    tipo: str | None,
    numero: str | None,
    empresa: str | None,
    valor_tag: str | None,
    com: str | None,
) -> str:
    fecha = fecha_ddmmyyyy or "00000000"
    tipo_n = tipo or "FE"
    num = (numero or "S/N").strip()
    emp = empresa or "EMPRESA"
    valor = valor_tag or "$0"
    com_part = com if com else _COM_PENDIENTE
    return f"{fecha} {tipo_n} {num} {emp} {valor} {com_part}"


def build_contramarcado(
    *,
    fecha_emision: str | None,
    tipo_documento: str | None,
    numero_factura: str | None,
    proveedor: str | None,
    total: Any,
    extracted: dict | None = None,
    ocr_text: str | None = None,
    autobits_candidates: list[ComCandidate] | None = None,
) -> ContramarcadoResult:
    """Construye el contramarcado completo a partir de datos ya extraídos + candidatos Autobits."""
    try:
        fecha = format_fecha_ddmmyyyy(fecha_emision)
        tipo = normalize_tipo_documento(tipo_documento)
        numero = (numero_factura or "").strip() or None
        empresa = normalize_empresa(proveedor)
        valor_tag = format_valor_tag(total)

        invoice_com, invoice_all = com_from_extracted(extracted, ocr_text)
        invoice_list = invoice_all if invoice_all else ([invoice_com] if invoice_com else [])

        com, source, confidence, warning, cand_payload = resolve_com_from_candidates(
            invoice_list,
            autobits_candidates or [],
        )

        if not fecha or not numero or not valor_tag:
            missing = []
            if not fecha:
                missing.append("fecha")
            if not numero:
                missing.append("número")
            if not valor_tag:
                missing.append("valor")
            value = build_contramarcado_string(
                fecha_ddmmyyyy=fecha,
                tipo=tipo,
                numero=numero,
                empresa=empresa,
                valor_tag=valor_tag,
                com=com,
            )
            return ContramarcadoResult(
                value=value,
                status=STATUS_ERROR if not com else STATUS_PENDIENTE,
                com=com,
                source=source if com else SOURCE_NONE,
                confidence=confidence,
                warning=f"Faltan datos para el contramarcado: {', '.join(missing)}.",
                candidates=cand_payload,
                tipo=tipo,
                numero=numero,
                empresa=empresa,
                fecha_ddmmyyyy=fecha,
                valor_tag=valor_tag,
            )

        value = build_contramarcado_string(
            fecha_ddmmyyyy=fecha,
            tipo=tipo,
            numero=numero,
            empresa=empresa,
            valor_tag=valor_tag,
            com=com,
        )

        if com and not warning:
            status = STATUS_GENERADO
        elif warning and "varias" in (warning or "").lower():
            status = STATUS_AMBIGUO
        else:
            status = STATUS_PENDIENTE
            if not warning:
                warning = "No fue posible identificar automáticamente el COM."

        return ContramarcadoResult(
            value=value,
            status=status,
            com=com,
            source=source if com else SOURCE_NONE,
            confidence=confidence,
            warning=warning,
            candidates=cand_payload,
            tipo=tipo,
            numero=numero,
            empresa=empresa,
            fecha_ddmmyyyy=fecha,
            valor_tag=valor_tag,
        )
    except Exception as exc:  # noqa: BLE001 — no tumbar el pipeline de facturas
        return ContramarcadoResult(
            value=f"00000000 FE S/N EMPRESA $0 {_COM_PENDIENTE}",
            status=STATUS_ERROR,
            com=None,
            source=SOURCE_NONE,
            confidence=0.0,
            warning=f"Error generando contramarcado: {exc}",
        )


def names_match_for_display(a: str | None, b: str | None) -> bool:
    """Utilidad de tests / debug."""
    return normalize_text(a) == normalize_text(b) or (
        bool(normalize_id(a)) and normalize_id(a) == normalize_id(b)
    )
