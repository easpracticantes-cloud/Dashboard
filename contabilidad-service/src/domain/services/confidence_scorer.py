"""Calculador de confianza por campo extraido."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FieldConfidence:
    valor: object | None
    confianza: float
    fuente: str


@dataclass
class ConfidenceResult:
    global_score: float
    fields: dict[str, float] = field(default_factory=dict)
    fields_detail: dict[str, FieldConfidence] = field(default_factory=dict)
    requiere_revision: bool = False


INVOICE_FIELDS = [
    ("numero_factura", "numero_factura"),
    ("proveedor", "proveedor"),
    ("nit", "nit_o_identificacion"),
    ("fecha_emision", "fecha_emision"),
    ("subtotal", "subtotal"),
    ("impuesto", "impuesto"),
    ("total", "total"),
    ("moneda", "moneda"),
    ("compra", "compra"),
    ("reserva", "reserva"),
]

REVISION_THRESHOLD = 75.0


def _field_present(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str) and not value.strip():
        return False
    return True


def _resolve_value(extracted: dict, key: str):
    val = extracted.get(key)
    if isinstance(extracted.get("proveedor"), dict) and key == "proveedor":
        val = extracted["proveedor"].get("nombre")
    if isinstance(extracted.get("proveedor"), dict) and key == "nit_o_identificacion":
        val = extracted["proveedor"].get("nit")
    if key in {"compra", "reserva"} and isinstance(val, dict):
        val = val.get("numero") or val.get("id") or val
    return val


def _infer_source(extracted: dict, key: str, ocr_chars: int) -> str:
    metodo = str(extracted.get("_metodo_ocr") or extracted.get("metodo_ocr") or "").upper()
    if "VISION" in metodo:
        return "VISION+IA"
    if ocr_chars > 0:
        return "OCR+IA"
    return "IA"


def score_invoice_extraction(extracted: dict, ocr_chars: int = 0) -> ConfidenceResult:
    """Puntaje por campo presente, calidad OCR y consistencia basica."""
    fields: dict[str, float] = {}
    details: dict[str, FieldConfidence] = {}

    for label, key in INVOICE_FIELDS:
        val = _resolve_value(extracted, key)
        fuente = _infer_source(extracted, key, ocr_chars)

        if _field_present(val):
            score = 88.0
            if key == "total" and not _looks_numeric(val):
                score = 55.0
            if key in {"subtotal", "impuesto", "total"} and _looks_numeric(val):
                score = 92.0
            if key in {"compra", "reserva"}:
                score = 80.0
        else:
            score = 0.0

        fields[label] = score
        details[label] = FieldConfidence(valor=val if _field_present(val) else None, confianza=score, fuente=fuente)

    # Consistencia matematica: baja confianza de totales si no cuadra
    math_ok = _math_consistent(extracted)
    if math_ok is False:
        for k in ("subtotal", "impuesto", "total"):
            if k in fields and fields[k] > 0:
                fields[k] = min(fields[k], 55.0)
                details[k].confianza = fields[k]
                details[k].fuente = details[k].fuente + "+REGLA"

    if extracted.get("requiere_revision"):
        for k in fields:
            fields[k] = min(fields[k], 70.0)
            details[k].confianza = fields[k]

    ocr_factor = min(ocr_chars / 200, 1.0) if ocr_chars else 0.55
    if fields:
        # compra/reserva son opcionales: no castigan el global si faltan
        core_keys = [k for k in fields if k not in {"compra", "reserva"}]
        core = [fields[k] for k in core_keys] or list(fields.values())
        global_score = round(sum(core) / len(core) * ocr_factor, 1)
    else:
        global_score = 0.0

    if math_ok is False:
        global_score = min(global_score, 68.0)

    requiere = global_score < REVISION_THRESHOLD or bool(extracted.get("requiere_revision", False)) or math_ok is False

    return ConfidenceResult(
        global_score=global_score,
        fields=fields,
        fields_detail=details,
        requiere_revision=bool(requiere),
    )


def confidence_to_dict(result: ConfidenceResult) -> dict:
    """Serializa confidence para extracted_json / API."""
    return {
        "global": result.global_score,
        "fields": result.fields,
        "fields_detail": {
            k: {"valor": v.valor, "confianza": v.confianza, "fuente": v.fuente}
            for k, v in result.fields_detail.items()
        },
        "requiere_revision": result.requiere_revision,
    }


def _math_consistent(extracted: dict) -> bool | None:
    """True si cuadra, False si no, None si no hay suficientes datos."""
    sub = _to_float(extracted.get("subtotal"))
    iva = _to_float(extracted.get("impuesto") or extracted.get("iva"))
    total = _to_float(extracted.get("total"))
    if total is None:
        return None
    if sub is None and iva is None:
        return None
    if sub is None:
        return None
    expected = sub + (iva or 0.0)
    return abs(expected - total) <= max(1.0, total * 0.02)


def _to_float(value) -> float | None:
    if value is None or value == "":
        return None
    raw = str(value).replace("$", "").replace(" ", "")
    try:
        return float(raw.replace(",", ""))
    except ValueError:
        try:
            return float(raw.replace(".", "").replace(",", "."))
        except ValueError:
            return None


def _looks_numeric(value) -> bool:
    return _to_float(value) is not None
