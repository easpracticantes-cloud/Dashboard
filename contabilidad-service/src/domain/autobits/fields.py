"""Campos internos y alias para mapeo de columnas Excel Autobits."""

from __future__ import annotations

import re
from dataclasses import dataclass

# Campos que el sistema entiende al importar Autobits
AUTOBITS_FIELDS: tuple[str, ...] = (
    "proveedor",
    "nit",
    "numero_compra",
    "numero_reserva",
    "numero_documento",
    "valor",
    "fecha",
    "concepto",
    "observaciones",
    "estado_compra",
)

FIELD_LABELS: dict[str, str] = {
    "proveedor": "Proveedor",
    "nit": "NIT",
    "numero_compra": "Número de compra",
    "numero_reserva": "Número de reserva",
    "numero_documento": "Número documento / factura",
    "valor": "Valor",
    "fecha": "Fecha",
    "concepto": "Concepto",
    "observaciones": "Observaciones",
    "estado_compra": "Estado de la compra",
}

# Columnas reales del export Autobits (Orden de compra + Reserva)
AUTOBITS_EXPORT_COLUMNS: tuple[str, ...] = (
    "NIT/CC Proveedor (Orden de Compra)",
    "Nombre Proveedor (Orden de Compra)",
    "Codigo Orden de compra",
    "Comprador (Orden de Compra)",
    "Referencia (Orden de Compra)",
    "Fecha de compra",
    "NIT/CC Cliente (Reserva)",
    "Nombre Cliente (Reserva)",
    "Codigo Reserva",
    "Vendedor (Reserva)",
    "Referencia (Reserva)",
    "Fecha de ejecución (Reserva)",
    "Codigo Factura proveedor",
    "estado de la compra",
    "Nombre concepto",
    "Moneda",
    "Total",
    "SI",
    "NO",
    "OBSERVACIONES",
)

# Alias: primero los nombres reales de Autobits, luego variantes
FIELD_ALIASES: dict[str, list[str]] = {
    "proveedor": [
        "nombre proveedor (orden de compra)",
        "nombre proveedor",
        "proveedor",
        "razon social",
        "razón social",
        "supplier",
        "vendor",
    ],
    "nit": [
        "nit/cc proveedor (orden de compra)",
        "nit/cc proveedor",
        "nit proveedor",
        "nit",
        "cc proveedor",
        "identificacion",
        "identificación",
        "id tributaria",
    ],
    "numero_compra": [
        "codigo orden de compra",
        "código orden de compra",
        "codigo de orden de compra",
        "nro orden de compra",
        "numero orden de compra",
        "número orden de compra",
        "orden de compra",
        "numero compra",
        "número compra",
        "no compra",
        "purchase order",
        "id compra",
        "codigo com",
        "código com",
        "nº com",
        "no com",
        "nro com",
        "numero com",
        "número com",
        "compra",
    ],
    "numero_reserva": [
        "codigo reserva",
        "código reserva",
        "numero reserva",
        "número reserva",
        "no reserva",
        "reserva",
        "reservation",
    ],
    "numero_documento": [
        "codigo factura proveedor",
        "código factura proveedor",
        "codigo factura del proveedor",
        "nro factura proveedor",
        "numero factura proveedor",
        "código factura",
        "codigo factura",
        "factura proveedor",
        "numero factura",
        "número factura",
        "no factura",
        "nro factura",
        "num factura",
        "factura",
        "numero documento",
        "número documento",
        "invoice number",
        "invoice",
    ],
    "valor": [
        "total",
        "valor",
        "monto",
        "importe",
        "valor total",
        "amount",
    ],
    "fecha": [
        "fecha de ejecución (reserva)",
        "fecha de ejecucion (reserva)",
        "fecha de ejecución",
        "fecha de ejecucion",
        "fecha de compra",
        "fecha compra",
        "fecha emision",
        "fecha emisión",
        "fecha factura",
        "fecha",
        "date",
    ],
    "concepto": [
        "nombre concepto",
        "concepto",
        "descripcion",
        "descripción",
        "detalle",
    ],
    "observaciones": [
        "observaciones",
        "observacion",
        "observación",
        "notas",
        "comentario",
        "comentarios",
    ],
    "estado_compra": [
        "estado de la compra",
        "estado compra",
    ],
}


def normalize_header(value: str) -> str:
    """Normaliza encabezado: acentos, N°, puntos y paréntesis no deben romper el mapeo."""
    import unicodedata

    text = unicodedata.normalize("NFKD", str(value or "").strip().lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.replace("nº", "nro").replace("n°", "nro").replace("n.o", "nro")
    text = re.sub(r"[./_#|:;]+", " ", text)
    text = re.sub(r"[()\[\]{}]", " ", text)
    return " ".join(text.split())


# Encabezados canónicos del export Autobits real: siempre tienen prioridad sobre la IA.
CANONICAL_COLUMN_PREFERENCES: dict[str, tuple[str, ...]] = {
    "numero_compra": (
        "codigo orden de compra",
        "código orden de compra",
    ),
    "numero_reserva": (
        "codigo reserva",
        "código reserva",
    ),
    "proveedor": ("nombre proveedor (orden de compra)",),
    "nit": ("nit/cc proveedor (orden de compra)",),
    "fecha": (
        "fecha de ejecución (reserva)",
        "fecha de ejecucion (reserva)",
        "fecha de compra",
    ),
    "concepto": ("nombre concepto",),
    "valor": ("total",),
    "estado_compra": ("estado de la compra",),
    "observaciones": ("observaciones",),
    "numero_documento": (
        "codigo factura proveedor",
        "código factura proveedor",
    ),
}


def prefer_canonical_columns(
    mapping: dict[str, str | None], columns: list[str]
) -> dict[str, str | None]:
    """Fuerza Codigo Reserva / Codigo Orden de compra si existen en el Excel."""
    out = dict(mapping or {})
    by_norm = {normalize_header(c): c for c in columns if c}
    for field, preferred in CANONICAL_COLUMN_PREFERENCES.items():
        for needle in preferred:
            col = by_norm.get(normalize_header(needle))
            if col:
                out[field] = col
                break
    return out


_COM_IN_TEXT = re.compile(r"COM\s*0*(\d{4,10})", re.IGNORECASE)


def _parse_raw_json(raw_json):
    if not raw_json:
        return None
    if isinstance(raw_json, dict):
        return raw_json
    try:
        import json

        raw = json.loads(raw_json)
    except Exception:  # noqa: BLE001
        return None
    return raw if isinstance(raw, dict) else None


def com_from_value(raw: str | None) -> str | None:
    """Solo acepta códigos tipo COM007441. Nunca un número de factura (FE-6920, FPFL-…)."""
    if not raw:
        return None
    m = _COM_IN_TEXT.search(str(raw))
    if not m:
        return None
    digits = m.group(1)
    return f"COM{digits.zfill(6) if len(digits) <= 6 else digits}"


_INVOICE_PREFIX = re.compile(
    r"^(FPOS|FPFL|FVPOS|FLYP|FACT|FAC|FEL|FEC|HIN|CDC|FE|FV|FC|FP)-?\d{3,}",
    re.IGNORECASE,
)


def looks_like_invoice_code(raw: str | None) -> bool:
    """Detecta códigos de factura (FE-6920, FPFL-…, FLYP, HIN36005), no órdenes tipo C-1001."""
    text = re.sub(r"[\s./]", "", str(raw or "").strip().upper())
    if not text or _COM_IN_TEXT.search(text):
        return False
    return bool(_INVOICE_PREFIX.match(text))


def looks_like_autobits_export(columns: list[str]) -> bool:
    """True si el Excel trae el esquema real de Autobits (no hace falta IA)."""
    if not columns:
        return False
    norms = {normalize_header(c) for c in columns if c}
    canon = {normalize_header(c) for c in AUTOBITS_EXPORT_COLUMNS}
    hits = len(norms & canon)
    if hits >= 6:
        return True
    claves = {
        "codigo orden de compra",
        "codigo reserva",
        "codigo factura proveedor",
        "nit cc proveedor orden de compra",
        "nombre proveedor orden de compra",
        "total",
    }
    return len(norms & claves) >= 4


def deterministic_mapping(columns: list[str]) -> dict[str, str | None]:
    """Mapeo fijo del export Autobits: canónico gana sobre alias."""
    return prefer_canonical_columns(suggest_mapping(columns), columns)


def value_from_row_dict(row_dict: dict, *needles: str):
    """Lee un valor del Excel por nombre de encabezado, respetando el orden de needles."""
    if not isinstance(row_dict, dict) or not row_dict:
        return None
    by_norm: dict[str, object] = {}
    for key, value in row_dict.items():
        if value is None or str(value).strip() == "":
            continue
        by_norm.setdefault(normalize_header(str(key)), value)
    for needle in needles:
        na = normalize_header(needle)
        if na in by_norm:
            return by_norm[na]
    for needle in needles:
        na = normalize_header(needle)
        if len(na) < 5:
            continue
        for key, value in row_dict.items():
            if value is None or str(value).strip() == "":
                continue
            header = normalize_header(str(key))
            if na != header and na in header:
                return value
    return None


def com_from_excel_record(record) -> str | None:
    """COM real de la fila Autobits (columna Código Orden de compra; nunca la factura)."""
    raw = _parse_raw_json(getattr(record, "raw_json", None) or getattr(record, "raw", None))
    if raw:
        canon = value_from_row_dict(
            raw,
            "codigo orden de compra",
            "código orden de compra",
        )
        com = com_from_value(str(canon) if canon is not None else None)
        if com:
            return com
    compra, _ = excel_compra_reserva(record)
    com = com_from_value(compra)
    if com:
        return com
    com = com_from_value(getattr(record, "numero_compra", None))
    if com:
        return com
    if not raw:
        return None
    # Último recurso: una celda COM… que no sea la columna de factura.
    for key, value in raw.items():
        header = normalize_header(str(key))
        if "factura" in header:
            continue
        found = com_from_value(str(value) if value is not None else None)
        if found:
            return found
    return None


def canonical_numero_compra(numero_compra: str | None, raw=None) -> str | None:
    """COM persistible: nunca un número de factura. None si no hay COM real."""

    class _Row:
        def __init__(self) -> None:
            self.numero_compra = numero_compra
            self.raw_json = raw
            self.raw = raw

    com = com_from_excel_record(_Row())
    if com:
        return com
    text = (numero_compra or "").strip() or None
    if not text or looks_like_invoice_code(text):
        return None
    return text


def excel_compra_reserva(record) -> tuple[str | None, str | None]:
    """OC y reserva canónicos del Excel (raw_json), con fallback a columnas densas."""
    compra = (getattr(record, "numero_compra", None) or "").strip() or None
    reserva = (getattr(record, "numero_reserva", None) or "").strip() or None
    raw_json = getattr(record, "raw_json", None)
    if not raw_json:
        return compra, reserva
    try:
        import json

        raw = json.loads(raw_json) if isinstance(raw_json, str) else raw_json
    except Exception:  # noqa: BLE001
        return compra, reserva
    if not isinstance(raw, dict):
        return compra, reserva
    canon_compra = value_from_row_dict(
        raw,
        "codigo orden de compra",
        "código orden de compra",
    )
    canon_reserva = value_from_row_dict(
        raw,
        "codigo reserva",
        "código reserva",
    )
    if canon_compra is not None and str(canon_compra).strip():
        compra = str(canon_compra).strip()
    if canon_reserva is not None and str(canon_reserva).strip():
        reserva = str(canon_reserva).strip()
    return compra, reserva


def normalize_excel_nit(value) -> str | None:
    """NIT desde Excel: 900123456.0, 900.123.456-1 o notación científica."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return str(value) if value else None
    if isinstance(value, float):
        if value != value or value == 0:
            return None
        if abs(value) >= 1000 and abs(value - round(value)) < 1e-6:
            return str(int(round(value)))
        return None
    text = str(value).strip()
    if not text:
        return None
    if re.fullmatch(r"\d+\.0+", text):
        return text.split(".", 1)[0]
    sci = re.fullmatch(r"[+\-]?\d+(?:\.\d+)?[eE][+\-]?\d+", text.replace(",", "."))
    if sci:
        try:
            as_int = int(float(text.replace(",", ".")))
            return str(as_int) if as_int else None
        except ValueError:
            pass
    cleaned = re.sub(r"[^\d\-]", "", text).strip("-")
    if not cleaned or not re.search(r"\d", cleaned):
        return None
    if cleaned.count("-") > 1:
        cleaned = re.sub(r"\D", "", text)
    return cleaned or None


def excel_nit(record) -> str | None:
    """NIT del Excel (columna canónica o campo denso)."""
    raw = _parse_raw_json(getattr(record, "raw_json", None) or getattr(record, "raw", None))
    if raw:
        found = value_from_row_dict(
            raw,
            "nit/cc proveedor (orden de compra)",
            "nit/cc proveedor",
            "nit proveedor",
            "nit",
        )
        nit = normalize_excel_nit(found)
        if nit:
            return nit
    return normalize_excel_nit(getattr(record, "nit", None))


def excel_fecha(record) -> str | None:
    """Fecha de ejecución/compra del Excel."""
    raw = _parse_raw_json(getattr(record, "raw_json", None) or getattr(record, "raw", None))
    if raw:
        found = value_from_row_dict(
            raw,
            "fecha de ejecución (reserva)",
            "fecha de ejecucion (reserva)",
            "fecha de compra",
            "fecha",
        )
        text = str(found).strip() if found is not None else ""
        if text:
            return text
    fecha = (getattr(record, "fecha", None) or "").strip()
    return fecha or None


def excel_proveedor(record) -> str | None:
    raw = _parse_raw_json(getattr(record, "raw_json", None) or getattr(record, "raw", None))
    if raw:
        found = value_from_row_dict(
            raw,
            "nombre proveedor (orden de compra)",
            "nombre proveedor",
            "proveedor",
        )
        text = str(found).strip() if found is not None else ""
        if text:
            return text
    nombre = (getattr(record, "proveedor", None) or "").strip()
    return nombre or None


def excel_valor(record) -> float | None:
    from domain.utils.money import money_to_float

    raw = _parse_raw_json(getattr(record, "raw_json", None) or getattr(record, "raw", None))
    if raw:
        found = value_from_row_dict(raw, "total", "valor", "valor total")
        parsed = money_to_float(found) if found not in (None, "") else None
        if parsed is not None:
            return parsed
    return money_to_float(getattr(record, "valor", None))


def excel_factura_proveedor(record) -> str | None:
    """Número de factura del Excel Autobits (Codigo Factura proveedor)."""
    raw = _parse_raw_json(getattr(record, "raw_json", None) or getattr(record, "raw", None))
    if raw:
        found = value_from_row_dict(
            raw,
            "codigo factura proveedor",
            "código factura proveedor",
            "codigo factura",
        )
        text = str(found).strip() if found is not None else ""
        if text:
            return text
    doc = (getattr(record, "numero_documento", None) or "").strip()
    return doc or None


def suggest_mapping(columns: list[str]) -> dict[str, str | None]:
    """Sugiere mapeo columna Excel → campo interno."""
    normalized = {normalize_header(col): col for col in columns}
    mapping: dict[str, str | None] = {field: None for field in AUTOBITS_FIELDS}
    used_columns: set[str] = set()

    for field, aliases in FIELD_ALIASES.items():
        # 1) coincidencia exacta normalizada
        for alias in aliases:
            norm_alias = normalize_header(alias)
            if norm_alias in normalized and normalized[norm_alias] not in used_columns:
                mapping[field] = normalized[norm_alias]
                used_columns.add(normalized[norm_alias])
                break
        if mapping[field]:
            continue
        # 2) la columna contiene el alias (evitar mapear SI/NO/OBSERVACIONES por error)
        for norm_col, original in normalized.items():
            if original in used_columns:
                continue
            if norm_col in {"si", "no", "moneda"}:
                continue
            if field != "observaciones" and norm_col == "observaciones":
                continue
            if field != "estado_compra" and "estado de la compra" in norm_col:
                continue
            # Referencia (Orden de compra) NO es el COM; NIT cliente no es NIT proveedor.
            if field == "numero_compra" and ("referencia" in norm_col or "factura" in norm_col):
                continue
            if field == "numero_reserva" and "referencia" in norm_col:
                continue
            if field == "nit" and "cliente" in norm_col:
                continue
            if field == "proveedor" and "cliente" in norm_col:
                continue
            # Alias cortos ("compra", "factura") solo coinciden exactos; si no,
            # "compra" ⊂ "fecha de compra" y el COM se pierde.
            if any(
                (" " in na or len(na) >= 10)
                and len(na) >= 4
                and na in norm_col
                for a in aliases
                for na in [normalize_header(a)]
            ):
                mapping[field] = original
                used_columns.add(original)
                break

    return mapping


@dataclass
class ParsedAutobitsRow:
    """Fila parseada del Excel."""

    row_number: int
    proveedor: str | None = None
    nit: str | None = None
    numero_compra: str | None = None
    numero_reserva: str | None = None
    numero_documento: str | None = None
    valor: float | None = None
    fecha: str | None = None
    concepto: str | None = None
    observaciones: str | None = None
    estado_compra: str | None = None
    raw: dict | None = None
    errors: list[str] | None = None

    def is_empty(self) -> bool:
        return not any(
            [
                self.proveedor,
                self.nit,
                self.numero_compra,
                self.numero_reserva,
                self.numero_documento,
                self.valor,
                self.fecha,
                self.concepto,
                self.observaciones,
            ]
        )

    def record_hash(self) -> str:
        import hashlib

        parts = "|".join(
            str(p or "")
            for p in [
                self.nit,
                self.numero_compra,
                self.numero_reserva,
                self.numero_documento,
                self.valor,
                self.fecha,
            ]
        )
        return hashlib.sha256(parts.encode()).hexdigest()
