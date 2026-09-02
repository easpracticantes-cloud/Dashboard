"""Validaciones basicas para datos extraidos de facturas."""

from __future__ import annotations

TIPOS_VALIDOS = {
    "factura",
    "cuenta_de_cobro",
    "cuenta de cobro",
    "recibo",
    "comprobante",
}


def es_numero(valor):
    """Revisa si un valor se puede interpretar como numero."""
    if valor is None or valor == "":
        return False

    try:
        texto = str(valor).replace("$", "").replace(" ", "")
        texto = texto.replace(".", "").replace(",", ".")
        float(texto)
        return True
    except ValueError:
        return False


def _to_float(valor):
    if valor is None or valor == "":
        return None
    try:
        return float(str(valor).replace("$", "").replace(" ", "").replace(",", ""))
    except ValueError:
        try:
            texto = str(valor).replace("$", "").replace(" ", "").replace(".", "").replace(",", ".")
            return float(texto)
        except ValueError:
            return None


def validar_factura(datos):
    """Valida campos minimos, matematica y marca si requiere revision."""
    observaciones = []
    datos = dict(datos or {})

    if not datos.get("numero_factura"):
        observaciones.append("Falta numero_factura")

    proveedor = datos.get("proveedor")
    if isinstance(proveedor, dict):
        if not (proveedor.get("nombre") or "").strip():
            observaciones.append("Falta proveedor")
    elif not proveedor:
        observaciones.append("Falta proveedor")

    if not datos.get("fecha_emision"):
        observaciones.append("Falta fecha_emision")

    if not datos.get("total"):
        observaciones.append("Falta total")
    elif not es_numero(datos.get("total")):
        observaciones.append("El total no es numerico")

    tipo = str(datos.get("tipo_documento") or "").strip().lower()
    if tipo and tipo not in TIPOS_VALIDOS and tipo != "desconocido":
        observaciones.append("El tipo_documento no es reconocido")
    if tipo == "desconocido":
        observaciones.append("tipo_documento desconocido")
        datos["requiere_revision"] = True

    # Matematica deterministica: el LLM no es autoridad del total
    sub = _to_float(datos.get("subtotal"))
    iva = _to_float(datos.get("impuesto") or datos.get("iva"))
    total = _to_float(datos.get("total"))
    if sub is not None and total is not None:
        expected = sub + (iva or 0.0)
        if abs(expected - total) > max(1.0, total * 0.02):
            observaciones.append(
                f"Inconsistencia matematica: subtotal({sub})+impuesto({iva or 0}) != total({total})"
            )
            datos["requiere_revision"] = True

    if observaciones:
        estado = "revisar"
        datos["requiere_revision"] = True
    else:
        estado = "procesado"
        datos["requiere_revision"] = bool(datos.get("requiere_revision", False))

    observacion_actual = datos.get("observaciones")
    texto_observaciones = "; ".join(observaciones)

    if observacion_actual and texto_observaciones:
        datos["observaciones"] = f"{observacion_actual}; {texto_observaciones}"
    elif texto_observaciones:
        datos["observaciones"] = texto_observaciones

    campos_faltantes = list(datos.get("campos_faltantes") or [])
    for observacion in observaciones:
        if observacion.startswith("Falta "):
            campo = observacion.replace("Falta ", "")
            if campo not in campos_faltantes:
                campos_faltantes.append(campo)

    datos["campos_faltantes"] = campos_faltantes

    return datos, estado, datos.get("observaciones")
