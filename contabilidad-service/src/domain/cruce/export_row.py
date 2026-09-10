"""Fila consolidada para el Excel de salida (datos ya persistidos en SIG)."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from domain.cruce.fields import fold
from domain.cruce.workbook_spec import SPECIAL_PROVIDER_TOKENS


@dataclass
class CruceExportRow:
    proveedor: str | None = None
    nit: str | None = None
    numero_compra: str | None = None
    numero_reserva: str | None = None
    fecha_ejecucion: str | None = None
    valor: Decimal | None = None
    factura_cdc: str | None = None
    fecha_pago: str | None = None
    concepto: str | None = None
    estado_compra: str | None = None
    observaciones: str | None = None
    match_type: str | None = None
    match_reasons: list[str] = field(default_factory=list)
    ambiguo: bool = False
    duplicado: bool = False
    document_id: int | None = None
    crossing_id: int | None = None
    autobits_record_id: int | None = None
    origen: str = "SIG"
    referencia_oc: str | None = None
    precio_terceros: Decimal | None = None
    comprador: str | None = None
    vendedor: str | None = None
    cantidad: Decimal | None = None

    def is_guia(self) -> bool:
        texto = fold(self.concepto or "")
        return "guianza" in texto or texto.startswith("guia ") or " guias" in texto

    def special_sheet_token(self) -> str | None:
        nombre = fold(self.proveedor)
        if not nombre:
            return None
        for token, _sheet in SPECIAL_PROVIDER_TOKENS:
            if token in nombre:
                return token
        return None

    def month(self) -> int | None:
        if not self.fecha_ejecucion or len(self.fecha_ejecucion) < 7:
            return None
        try:
            return int(self.fecha_ejecucion[5:7])
        except ValueError:
            return None

    def year(self) -> int | None:
        if not self.fecha_ejecucion or len(self.fecha_ejecucion) < 4:
            return None
        try:
            return int(self.fecha_ejecucion[:4])
        except ValueError:
            return None

    def mes_nombre(self) -> str | None:
        meses = (
            "ENERO",
            "FEBRERO",
            "MARZO",
            "ABRIL",
            "MAYO",
            "JUNIO",
            "JULIO",
            "AGOSTO",
            "SEPTIEMBRE",
            "OCTUBRE",
            "NOVIEMBRE",
            "DICIEMBRE",
        )
        m = self.month()
        if not m or m < 1 or m > 12:
            return None
        return meses[m - 1]
