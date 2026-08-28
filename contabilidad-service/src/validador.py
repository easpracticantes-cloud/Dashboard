"""Validaciones basicas para datos extraidos de facturas."""


def es_numero(valor):
    """Revisa si un valor se puede interpretar como numero."""
    if valor is None or valor == "":
        return False

    try:
        # Permitimos valores con separadores comunes.
        texto = str(valor).replace("$", "").replace(" ", "")
        texto = texto.replace(".", "").replace(",", ".")
        float(texto)
        return True
    except ValueError:
        return False


def validar_factura(datos):
    """Valida campos minimos y marca si la factura requiere revision."""
    observaciones = []

    if not datos.get("numero_factura"):
        observaciones.append("Falta numero_factura")

    if not datos.get("proveedor"):
        observaciones.append("Falta proveedor")

    if not datos.get("fecha_emision"):
        observaciones.append("Falta fecha_emision")

    if not datos.get("total"):
        observaciones.append("Falta total")
    elif not es_numero(datos.get("total")):
        observaciones.append("El total no es numerico")

    if datos.get("tipo_documento") != "factura":
        observaciones.append("El tipo_documento no es factura")

    if observaciones:
        estado = "revisar"
        datos["requiere_revision"] = True
    else:
        estado = "procesado"
        datos["requiere_revision"] = bool(datos.get("requiere_revision", False))

    # Conservamos observaciones de Ollama y agregamos las de validacion.
    observacion_actual = datos.get("observaciones")
    texto_observaciones = "; ".join(observaciones)

    if observacion_actual and texto_observaciones:
        datos["observaciones"] = f"{observacion_actual}; {texto_observaciones}"
    elif texto_observaciones:
        datos["observaciones"] = texto_observaciones

    # Agregamos campos faltantes sin duplicar.
    campos_faltantes = datos.get("campos_faltantes") or []
    for observacion in observaciones:
        if observacion.startswith("Falta "):
            campo = observacion.replace("Falta ", "")
            if campo not in campos_faltantes:
                campos_faltantes.append(campo)

    datos["campos_faltantes"] = campos_faltantes

    return datos, estado, datos.get("observaciones")
