"""Aritmética monetaria en pesos colombianos.

Las columnas de la base siguen siendo ``Float`` (SQLite). El dominio calcula con
``Decimal`` y solo convierte a ``float`` al escribir con :func:`money_to_float`.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

COP_QUANTUM = Decimal("0.01")
ZERO = Decimal("0.00")

_SOLO_NUMERO = re.compile(r"[^0-9,.\-]")


def to_money(value: object) -> Decimal:
    """Convierte cualquier valor a Decimal COP con 2 decimales (HALF_UP).

    Acepta los formatos que llegan del Excel/OCR: ``1.234.567,89``,
    ``$ 1,234,567.89``, ``850000.0`` o ``(1.500)`` para negativos.
    Un valor vacío o ilegible devuelve ``0.00``.
    """
    if value is None:
        return ZERO
    if isinstance(value, Decimal):
        decimal_value: Decimal | None = value
    elif isinstance(value, bool):
        return ZERO
    elif isinstance(value, int):
        decimal_value = Decimal(value)
    elif isinstance(value, float):
        decimal_value = Decimal(str(value))
    else:
        decimal_value = _parse_texto(str(value))

    if decimal_value is None or not decimal_value.is_finite():
        return ZERO
    try:
        return decimal_value.quantize(COP_QUANTUM, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, OverflowError):
        return ZERO


def money_sum(values: Iterable[object]) -> Decimal:
    """Suma monetaria exacta; ignora nulos y valores ilegibles."""
    total = ZERO
    for value in values:
        total += to_money(value)
    return total.quantize(COP_QUANTUM, rounding=ROUND_HALF_UP)


def values_close(
    a: object,
    b: object,
    rel: float | Decimal = 0.01,
    abs_tol: float | Decimal = 1,
) -> bool:
    """True si dos importes son equivalentes contablemente.

    ``rel`` es una fracción (0.01 = 1%) y ``abs_tol`` el piso absoluto en pesos,
    para que redondeos de un peso no generen subsanaciones.
    """
    if a is None or b is None:
        return False

    valor_a = to_money(a)
    valor_b = to_money(b)
    if valor_a == valor_b:
        return True

    tolerancia = max(_a_decimal(abs_tol), _a_decimal(rel) * max(abs(valor_a), abs(valor_b)))
    return abs(valor_a - valor_b) <= tolerancia


def money_to_float(value: object) -> float | None:
    """Valor listo para columnas Float; ``None`` se conserva como ``None``."""
    if value is None:
        return None
    return float(to_money(value))


def format_cop(value: object) -> str:
    """Formato de presentación: ``$1.234.567``."""
    entero = to_money(value).to_integral_value(rounding=ROUND_HALF_UP)
    signo = "-" if entero < 0 else ""
    return f"{signo}${abs(int(entero)):,}".replace(",", ".")


def _a_decimal(value: float | Decimal) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _parse_texto(raw: str) -> Decimal | None:
    texto = raw.strip()
    if not texto:
        return None

    negativo = texto.startswith("-") or (texto.startswith("(") and texto.endswith(")"))
    texto = _SOLO_NUMERO.sub("", texto).replace("-", "")
    if not texto:
        return None

    ultimo_punto = texto.rfind(".")
    ultima_coma = texto.rfind(",")
    if ultimo_punto >= 0 and ultima_coma >= 0:
        if ultima_coma > ultimo_punto:
            texto = texto.replace(".", "").replace(",", ".")
        else:
            texto = texto.replace(",", "")
    elif ultima_coma >= 0:
        texto = _resolver_separador(texto, ",")
    elif ultimo_punto >= 0:
        texto = _resolver_separador(texto, ".")

    try:
        valor = Decimal(texto)
    except InvalidOperation:
        return None
    return -valor if negativo else valor


def _resolver_separador(texto: str, separador: str) -> str:
    """Decide si un separador único es de miles (``1.500``) o decimal (``12,50``)."""
    partes = texto.split(separador)
    if len(partes) > 2 or len(partes[-1]) == 3:
        return texto.replace(separador, "")
    return texto.replace(separador, ".")
