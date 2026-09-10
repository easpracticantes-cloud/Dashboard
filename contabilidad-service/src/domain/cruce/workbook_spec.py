"""Especificación del Excel estándar «CRUCE DE CUENTAS».

Fuente de verdad estructural: el libro de trabajo manual (p. ej. CRUCE DE
CUENTAS 2026.xlsx). No copia datos de ejemplo; solo nombres, orden, columnas
y fórmulas que el estándar sí define de forma sistemática.

Pestañas del estándar (orden):
  1. AÑO  {yyyy} ENERO - ABRIL   — bloques laterales por proveedor
  2. MAYO - JULIO                — igual
  3. AGOSTO                      — igual (Sep–Dic caen aquí: el estándar no
                                   tiene hoja posterior)
  4. VENTAS_DUSTER               — tabla estilo Autobits
  5. CDC BOSQUE DE PALMAS        — tabla Autobits + saldos de precompra
  6. PRECOMPRA LUGER {yyyy}      — kardex de unidades/valor

Campos del estándar SIN fuente en SIG (no se inventan):
  - DINERO ENTREGADOS / A DESCONTAR / A PAGAR EAS / A JUSTIFICAR
  - N° RECIBOS, BITÁCORA, RECIBOS, FOTOGRAFÍAS, TIEMPO DE DEMORA
  - PRECIO TERCEROS, Comprador, Vendedor, Cantidad, Referencia OC
  - SALDO ANTERIOR, PRE COMPRA ENTRADAS, ENTRADAS A FAVOR, INGRESO
  - Clientes de SIG (clients.name) — el Excel no tiene columna de cliente
"""

from __future__ import annotations

from dataclasses import dataclass

HEADER_FILL_BLUE = "3D85C6"
HEADER_FILL_PEACH = "F9CB9C"
HEADER_FILL_TEAL = "71D4D4"
PRECIO_EAS_FILL = "00FF00"
PRECIO_TERC_FILL = "00FFFF"
FONT_NAME = "Ubuntu"
FONT_NAME_TABLE = "Calibri"

PERIOD_BLOCK_HEADERS: tuple[str, ...] = (
    "FECHA DE EJECUCIÓN",
    "ORDEN DE COMPRA",
    "REF.",
    "VALOR",
    "FACTURA/CDC",
    "FECHA DE PAGO",
)

# Bloque de guianza del estándar. Las columnas extra no tienen fuente SIG.
GUIA_BLOCK_HEADERS: tuple[str, ...] = (
    "FECHA DE EJECUCIÓN",
    "REF.",
    "ORDEN DE COMPRA",
    "VALOR GUIANZA",
    "FACTURA/CDC",
    "DINERO ENREGADOS EN TRANSFERENCIA BANCARIA",
    "DINERO A DESCONTAR DEL ENTREGADO",
    "DINERO A PAGAR DE EAS AL GUIA",
    "DINERO A JUSTIFICAR CON CUENTA DE COBRO",
    "VALOR A PAGAR",
    "N° RECIBOS",
    "BITACORA",
    "RECIBOS",
    "FOTOGRAFIAS O VIDEO TESTIMONIAL",
    "TIEMPO DE DEMORA EN ENTREGA DE INFORME",
)

DUSTER_HEADERS: tuple[str, ...] = (
    "MES",
    "NIT/CC Proveedor (Orden de Compra)",
    "Codigo Orden de compra",
    "Referencia (Orden de Compra)",
    "Codigo Reserva",
    "Fecha de ejecución (Reserva)",
    "estado de la compra",
    "Description servicio",
    "PRECIO EAS",
    "PRECIO TERCEROS",
)

BOSQUE_HEADERS: tuple[str, ...] = (
    "NIT/CC Proveedor (Orden de Compra)",
    "Nombre Proveedor (Orden de Compra)",
    "Codigo Orden de compra",
    "Comprador (Orden de Compra)",
    "Codigo Reserva",
    "Vendedor (Reserva)",
    "Fecha de ejecución (Reserva)",
    "estado de la compra",
    "Cantidad",
    "Total",
)

LUGER_HEADERS: tuple[str, ...] = (
    "FECHA",
    "ORDEN DE COMPRA",
    "VALOR",
    "INGRESO",
    "EGRESO",
)

# Tokens ya usados por CruceExcelAdapter._table_provider
SPECIAL_PROVIDER_TOKENS: tuple[tuple[str, str], ...] = (
    ("duster", "VENTAS_DUSTER"),
    ("bosque", "CDC BOSQUE DE PALMAS"),
    ("luger", "PRECOMPRA LUGER"),
)

PROVIDERS_PER_BAND = 7
BLOCK_WIDTH = len(PERIOD_BLOCK_HEADERS)
BLOCK_GAP = 1
MAX_ROWS_PER_BAND = 80

# Fórmulas sistemáticas del estándar (no las ad-hoc de una celda suelta).
# VALOR A PAGAR = VALOR GUIANZA cuando no hay ajustes en SIG.
# EGRESO LUGER = saldo anterior − VALOR (requiere INGRESO inicial; si falta, no se escribe).
# SUM de PRECIO EAS al cierre de VENTAS_DUSTER.


@dataclass(frozen=True)
class PeriodSheet:
    name: str
    months: tuple[int, ...]


def period_sheets(year: int) -> tuple[PeriodSheet, PeriodSheet, PeriodSheet]:
    return (
        PeriodSheet(f"AÑO  {year} ENERO - ABRIL", (1, 2, 3, 4)),
        PeriodSheet("MAYO - JULIO", (5, 6, 7)),
        PeriodSheet("AGOSTO", (8, 9, 10, 11, 12)),
    )


def luger_sheet_name(year: int) -> str:
    return f"PRECOMPRA LUGER {year}"


def standard_sheet_names(year: int) -> tuple[str, ...]:
    p1, p2, p3 = period_sheets(year)
    return (
        p1.name,
        p2.name,
        p3.name,
        "VENTAS_DUSTER",
        "CDC BOSQUE DE PALMAS",
        luger_sheet_name(year),
    )


# Mapa Excel → fuente SIG (solo lo respaldado por el modelo).
# campo_excel: (entidad, atributo, nota)
FIELD_SOURCES: dict[str, tuple[str, str, str]] = {
    "FECHA DE EJECUCIÓN": ("account_crossings / autobits_records", "fecha_ejecucion / fecha", ""),
    "ORDEN DE COMPRA": ("account_crossings / autobits_records", "numero_compra", ""),
    "REF.": ("account_crossings / autobits_records", "numero_reserva", ""),
    "VALOR": ("account_crossings / autobits_records", "valor_autobits / valor", "Decimal; vacío si no hay valor"),
    "FACTURA/CDC": ("account_crossings / documents", "factura_cdc / numero_documento", "vacío si falta"),
    "FECHA DE PAGO": ("account_crossings", "fecha_pago", "no se usa payments.paid_at: es confirmación bancaria distinta"),
    "Nombre proveedor (bloque)": ("account_crossings / autobits_records / providers", "proveedor_nombre / proveedor / nombre", ""),
    "NIT/CC": ("autobits_records / providers", "nit", "no asumir igualdad con NIT de factura sin matching"),
    "estado de la compra": ("autobits_records", "estado_compra", ""),
    "Description servicio / Nombre concepto": ("autobits_records / documents", "concepto", ""),
    "PRECIO EAS": ("autobits_records", "valor", "Autobits importa Total o PRECIO EAS al mismo campo valor"),
    "MES": ("derivado", "fecha", "nombre de mes a partir de fecha; vacío si no hay fecha"),
}
