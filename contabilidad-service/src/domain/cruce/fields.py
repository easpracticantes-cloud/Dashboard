"""Campos, alias y coerciones del Excel «CRUCE DE CUENTAS».

Ese Excel no es tabular como el export de Autobits: cada proveedor ocupa un
bloque lateral con su propia fila de encabezados, y las columnas que importan
para el proceso contable son FACTURA/CDC y FECHA DE PAGO.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

# Campos que reconocemos dentro de un bloque del Excel de cruce
CRUCE_BLOCK_FIELDS: tuple[str, ...] = (
    "fecha",
    "compra",
    "reserva",
    "concepto",
    "valor",
    "factura",
    "pago",
    "nit",
    "proveedor",
    "estado",
    "observaciones",
)

BLOCK_ALIASES: dict[str, list[str]] = {
    "fecha": [
        "fecha de ejecucion",
        "fecha ejecucion",
        "fecha de servicio",
        "fecha",
    ],
    "compra": [
        "orden de compra",
        "codigo orden de compra",
        "cod orden de compra",
        "no. orden de compra",
    ],
    "reserva": [
        "codigo reserva",
        "cod reserva",
        "referencia",
        "ref.",
        "ref",
    ],
    "concepto": [
        "nombre concepto",
        "concepto",
        "descripcion servicio",
        "description servicio",
        "descripcion",
        "detalle",
    ],
    "valor": [
        "valor guianza",
        "precio eas",
        "valor",
        "total",
        "monto",
    ],
    "factura": [
        "factura/cdc",
        "factura / cdc",
        "factura cdc",
        "factura",
        "cdc",
        "cuenta de cobro",
    ],
    "pago": [
        "fecha de pago",
        "fecha pago",
        "pagado el",
    ],
    "nit": [
        "nit/cc proveedor",
        "nit proveedor",
        "nit",
    ],
    "proveedor": [
        "nombre proveedor",
        "proveedor",
    ],
    "estado": [
        "estado de la compra",
        "estado compra",
    ],
    "observaciones": [
        "observaciones",
        "observacion",
        "notas",
        "comentarios",
    ],
}

# Textos que no son nombres de proveedor aunque aparezcan sobre un bloque
JUNK_PROVIDERS = {
    "impresa",
    "total pagados",
    "entradas a favor",
    "si",
    "no",
    "cop",
    "moneda",
    "total",
    "valor",
    "subtotal",
    "saldo",
}


def fold(value: Any) -> str:
    """Minúsculas sin tildes, espacios colapsados."""
    text = "" if value is None else str(value)
    nfkd = unicodedata.normalize("NFKD", text)
    plain = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", plain.replace("\n", " ").lower()).strip()


# Encabezados que parecen un campo pero son totales / ruido de la hoja
_HEADER_NOISE = (
    "total pagad",
    "unidades disponible",
    "entradas a favor",
    "ahorro de la",
    "saldo anterior",
    "precio terceros",
)


def header_specificity(campo: str, header: Any) -> int:
    """Más alto = encabezado más preciso (p. ej. Codigo Reserva > REF.)."""
    h = fold(header)
    if not h:
        return 0
    best = 0
    for alias in BLOCK_ALIASES.get(campo, []):
        if h == alias:
            best = max(best, 100 + len(alias))
        elif h.startswith(alias):
            best = max(best, 50 + len(alias))
        elif len(alias) >= 12 and alias in h:
            best = max(best, 10 + len(alias))
    return best


def match_block_field(header: Any) -> str | None:
    """Devuelve el campo canónico al que corresponde un encabezado."""
    h = fold(header)
    if not h:
        return None
    if any(noise in h for noise in _HEADER_NOISE):
        return None
    for candidate, aliases in BLOCK_ALIASES.items():
        for alias in aliases:
            if h == alias:
                return candidate
    starts: list[tuple[int, str]] = []
    for candidate, aliases in BLOCK_ALIASES.items():
        for alias in aliases:
            if h.startswith(alias):
                starts.append((len(alias), candidate))
    if starts:
        starts.sort(reverse=True)
        return starts[0][1]
    # Contains solo con alias largos: evita que «NIT/CC … (Orden de compra)»
    # se lea como compra.
    contains: list[tuple[int, str]] = []
    for candidate, aliases in BLOCK_ALIASES.items():
        for alias in aliases:
            if len(alias) >= 12 and alias in h:
                contains.append((len(alias), candidate))
    if contains:
        contains.sort(reverse=True)
        return contains[0][1]
    return None


def is_header_text(field_name: str, value: Any) -> bool:
    """True si la celda es literalmente el encabezado de ese campo.

    Se compara exacto a propósito: valores reales como «CDC 55» empiezan por
    un alias («cdc») pero son datos, no encabezados repetidos.
    """
    folded = fold(value)
    if not folded:
        return False
    return folded in {fold(a) for a in BLOCK_ALIASES.get(field_name, [])}


def to_text(value: Any) -> str | None:
    """Texto limpio: sin saltos de línea internos ni puntuación colgando.

    En el Excel real las celdas traen cosas como «EAS002252,» o
    «FV POS \n13556»; sin normalizar, el emparejamiento con Autobits falla.
    """
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value).replace("\n", " ")).strip()
    text = text.strip(" ,;.-").strip()
    return text or None


def clave_documento(value: Any) -> str:
    """Normaliza códigos (compra/reserva) para comparar: solo alfanuméricos."""
    return re.sub(r"[^a-z0-9]", "", fold(value))


def to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace("$", "").replace(" ", "")
    if not text:
        return None
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    text = re.sub(r"[^0-9.\-]", "", text)
    try:
        return float(text)
    except ValueError:
        return None


def to_date(value: Any) -> str | None:
    """Normaliza a ISO (YYYY-MM-DD). Tolera fechas mal digitadas del Excel."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(text[:19], fmt).date().isoformat()
        except ValueError:
            continue
    # Casos tipo "12/0772026" (dedo pegado en el teclado)
    m = re.match(r"(\d{1,2})[/-](\d{1,4})[/-]?(\d{2,4})", text)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if month > 12:
            month = int(str(month)[:2])
        if month > 12:
            month = int(str(month)[:1])
        if year < 100:
            year += 2000
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            return None
    return None


def looks_like_invoice(value: Any) -> bool:
    text = fold(value)
    if not text:
        return False
    return bool(re.search(r"\b(fv|fe|fpos|cdc|factura|pos|cuenta de cobro)\b", text))


def looks_like_provider(value: Any) -> bool:
    """Heurística para el nombre de proveedor escrito encima de un bloque."""
    text = to_text(value)
    if not text or len(text) < 4:
        return False
    if match_block_field(text):
        return False
    if to_date(text) or to_float(text) is not None:
        return False
    if looks_like_invoice(text):
        return False
    folded = fold(text)
    if folded in JUNK_PROVIDERS or "unidades disponibles" in folded:
        return False
    if text.upper().startswith(("COM", "EAS", "COT")):
        return False
    return sum(ch.isalpha() for ch in text) >= 4


@dataclass
class ParsedCruceRow:
    """Fila útil del Excel de cruce de cuentas."""

    sheet: str
    row_number: int
    proveedor: str | None = None
    nit: str | None = None
    numero_compra: str | None = None
    numero_reserva: str | None = None
    concepto: str | None = None
    valor: float | None = None
    factura_cdc: str | None = None
    fecha_pago: str | None = None
    fecha_ejecucion: str | None = None
    estado_compra: str | None = None
    observaciones: str | None = None
    celda_factura: str | None = None
    celda_pago: str | None = None
    celda_compra: str | None = None

    def is_empty(self) -> bool:
        return not any(
            [
                self.numero_compra,
                self.numero_reserva,
                self.valor,
                self.factura_cdc,
                self.fecha_pago,
            ]
        )

    def match_keys(self) -> list[str]:
        """Claves de conciliación, de la más fuerte a la más débil."""
        compra = clave_documento(self.numero_compra)
        reserva = clave_documento(self.numero_reserva)
        keys: list[str] = []
        if compra and reserva:
            keys.append(f"cr:{compra}|{reserva}")
        if compra:
            keys.append(f"c:{compra}")
        if reserva:
            keys.append(f"r:{reserva}")
        if self.proveedor and self.valor is not None:
            keys.append(f"pv:{fold(self.proveedor)}|{round(self.valor)}")
        return keys

    def en_periodo(self, inicio: str | None, fin: str | None) -> bool | None:
        """True/False según la semana del reporte; None si la fila no trae fecha."""
        if not self.fecha_ejecucion:
            return None
        if inicio and self.fecha_ejecucion < inicio:
            return False
        if fin and self.fecha_ejecucion > fin:
            return False
        return True

    def label(self) -> str:
        partes = [p for p in (self.proveedor, self.numero_compra, self.numero_reserva) if p]
        return " · ".join(partes) if partes else f"{self.sheet} fila {self.row_number}"

    def to_dict(self) -> dict:
        return {
            "sheet": self.sheet,
            "row_number": self.row_number,
            "proveedor": self.proveedor,
            "nit": self.nit,
            "numero_compra": self.numero_compra,
            "numero_reserva": self.numero_reserva,
            "concepto": self.concepto,
            "valor": self.valor,
            "factura_cdc": self.factura_cdc,
            "fecha_pago": self.fecha_pago,
            "fecha_ejecucion": self.fecha_ejecucion,
            "estado_compra": self.estado_compra,
            "observaciones": self.observaciones,
            "celda_factura": self.celda_factura,
            "celda_pago": self.celda_pago,
            "celda_compra": self.celda_compra,
        }


@dataclass
class CruceParseResult:
    rows: list[ParsedCruceRow] = field(default_factory=list)
    sheets: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    skipped_rows: int = 0


def crossing_match_keys(
    *,
    proveedor: str | None,
    numero_compra: str | None,
    numero_reserva: str | None,
    valor: float | None,
) -> list[str]:
    """Mismas claves que ParsedCruceRow, para indexar filas ya guardadas."""
    return ParsedCruceRow(
        sheet="",
        row_number=0,
        proveedor=proveedor,
        numero_compra=numero_compra,
        numero_reserva=numero_reserva,
        valor=valor,
    ).match_keys()
