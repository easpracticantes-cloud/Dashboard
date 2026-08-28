"""Campos internos y alias para mapeo de columnas Excel Autobits."""

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

# Columnas reales del export Autobits (referencia del usuario)
AUTOBITS_EXPORT_COLUMNS: tuple[str, ...] = (
    "NIT/CC Proveedor (Orden de Compra)",
    "Nombre Proveedor (Orden de Compra)",
    "Codigo Orden de compra",
    "Codigo Reserva",
    "Fecha de ejecución (Reserva)",
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
        "orden de compra",
        "numero compra",
        "número compra",
        "no compra",
        "compra",
        "purchase",
        "id compra",
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
        "factura",
        "numero factura",
        "número factura",
        "no factura",
        "numero documento",
        "número documento",
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
    """Normaliza encabezado de columna para comparación."""
    return " ".join(str(value or "").strip().lower().split())


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
            if any(normalize_header(a) in norm_col for a in aliases):
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
