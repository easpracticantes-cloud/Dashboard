"""Calculador de confianza por campo extraido."""

from dataclasses import dataclass, field


@dataclass
class ConfidenceResult:
    global_score: float
    fields: dict[str, float] = field(default_factory=dict)
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
]

REVISION_THRESHOLD = 75.0


def _field_present(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str) and not value.strip():
        return False
    return True


def score_invoice_extraction(extracted: dict, ocr_chars: int = 0) -> ConfidenceResult:
    """Puntaje por campo presente y calidad OCR basica."""
    fields: dict[str, float] = {}

    for label, key in INVOICE_FIELDS:
        val = extracted.get(key)
        if isinstance(extracted.get("proveedor"), dict) and key == "proveedor":
            val = extracted["proveedor"].get("nombre")
        if isinstance(extracted.get("proveedor"), dict) and key == "nit_o_identificacion":
            val = extracted["proveedor"].get("nit")

        if _field_present(val):
            score = 95.0
            if key == "total" and not _looks_numeric(val):
                score = 60.0
            fields[label] = score
        else:
            fields[label] = 0.0

    if extracted.get("requiere_revision"):
        for k in fields:
            fields[k] = min(fields[k], 70.0)

    ocr_factor = min(ocr_chars / 200, 1.0) if ocr_chars else 0.5
    if fields:
        global_score = round(sum(fields.values()) / len(fields) * ocr_factor, 1)
    else:
        global_score = 0.0

    requiere = global_score < REVISION_THRESHOLD or extracted.get("requiere_revision", False)

    return ConfidenceResult(
        global_score=global_score,
        fields=fields,
        requiere_revision=bool(requiere),
    )


def _looks_numeric(value) -> bool:
    try:
        t = str(value).replace("$", "").replace(" ", "").replace(".", "").replace(",", ".")
        float(t)
        return True
    except ValueError:
        return False
