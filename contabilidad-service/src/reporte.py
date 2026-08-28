"""Funciones simples para crear reportes HTML."""

import csv
import json
from html import escape
from pathlib import Path


def leer_csv(ruta_csv):
    """Lee un CSV y devuelve sus filas y campos."""
    ruta_csv = Path(ruta_csv)

    if not ruta_csv.exists():
        return [], []

    with ruta_csv.open("r", newline="", encoding="utf-8") as archivo_csv:
        lector = csv.DictReader(archivo_csv)
        filas = list(lector)
        campos = lector.fieldnames or []

    return filas, campos


def crear_tabla_html(filas, campos):
    """Convierte filas de CSV en una tabla HTML simple."""
    if not campos:
        return "<p>No hay datos para mostrar.</p>"

    encabezados = ""
    for campo in campos:
        encabezados += f"<th>{escape(campo)}</th>"

    cuerpo = ""
    for fila in filas:
        cuerpo += "<tr>"
        for campo in campos:
            cuerpo += f"<td>{escape(fila.get(campo, ''))}</td>"
        cuerpo += "</tr>"

    return f"""
<table>
    <thead>
        <tr>{encabezados}</tr>
    </thead>
    <tbody>
        {cuerpo}
    </tbody>
</table>
"""


def formatear_json_ollama(ruta_json):
    """Lee un JSON de Ollama y lo devuelve formateado para HTML."""
    ruta_json = Path(ruta_json)

    if not ruta_json.exists():
        return "No hay JSON de Ollama para esta factura."

    try:
        datos = json.loads(ruta_json.read_text(encoding="utf-8"))
        return json.dumps(datos, ensure_ascii=False, indent=2)
    except Exception:
        return ruta_json.read_text(encoding="utf-8")


def crear_comparativo_html(
    resultados,
    ruta_textos="salidas/texto_extraido",
    ruta_json="salidas/json",
    limite=10,
):
    """Crea tarjetas comparativas OCR crudo vs salida de Ollama."""
    if not resultados:
        return "<p>No hay facturas procesadas para comparar.</p>"

    ruta_textos = Path(ruta_textos)
    ruta_json = Path(ruta_json)
    tarjetas = ""

    for indice, fila in enumerate(resultados[:limite], start=1):
        archivo = fila.get("archivo", "")
        stem = Path(archivo).stem
        ruta_texto = ruta_textos / f"{stem}.txt"
        ruta_datos = ruta_json / f"{stem}.json"

        if ruta_texto.exists():
            texto_ocr = ruta_texto.read_text(encoding="utf-8")
        else:
            texto_ocr = "No hay texto OCR guardado para esta factura."

        texto_ollama = formatear_json_ollama(ruta_datos)

        tarjetas += f"""
        <article class="comparativo">
            <h3>{indice}. {escape(archivo)}</h3>
            <div class="meta">
                <span>OCR usado: {escape(fila.get("metodo_ocr", ""))}</span>
                <span>Estado: {escape(fila.get("estado", ""))}</span>
                <span>Total detectado: {escape(fila.get("total", ""))}</span>
            </div>
            <div class="columnas-comparativo">
                <section>
                    <h4>Texto leido por OCR</h4>
                    <pre>{escape(texto_ocr.strip())}</pre>
                </section>
                <section>
                    <h4>Resultado estructurado por Ollama</h4>
                    <pre>{escape(texto_ollama.strip())}</pre>
                </section>
            </div>
        </article>
"""

    return tarjetas


def generar_reporte_html(
    ruta_resultados="salidas/resultados.csv",
    ruta_errores="salidas/errores.csv",
    ruta_reporte="salidas/reporte.html",
    total_facturas=None,
    ruta_textos="salidas/texto_extraido",
    ruta_json="salidas/json",
    limite_comparativo=10,
):
    """Genera salidas/reporte.html con resumen, comparativo, resultados y errores."""
    try:
        resultados, campos_resultados = leer_csv(ruta_resultados)
        errores, campos_errores = leer_csv(ruta_errores)

        if total_facturas is None:
            archivos = set()
            for fila in resultados:
                archivos.add(fila.get("archivo", ""))
            for fila in errores:
                archivos.add(fila.get("archivo", ""))
            total_facturas = len([archivo for archivo in archivos if archivo])

        procesadas = 0
        requieren_revision = 0

        for fila in resultados:
            if fila.get("estado") == "procesado":
                procesadas += 1

            revision = fila.get("requiere_revision", "").lower()
            if revision in ("true", "1", "si", "sí"):
                requieren_revision += 1

        archivos_con_error = set()
        for fila in errores:
            if fila.get("archivo"):
                archivos_con_error.add(fila.get("archivo"))

        tabla_resultados = crear_tabla_html(resultados, campos_resultados)
        tabla_errores = crear_tabla_html(errores, campos_errores)
        comparativo = crear_comparativo_html(
            resultados,
            ruta_textos=ruta_textos,
            ruta_json=ruta_json,
            limite=limite_comparativo,
        )

        html = f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Reporte de facturas OCR + Ollama</title>
    <style>
        body {{
            font-family: Arial, sans-serif;
            margin: 32px;
            color: #222;
            background-color: #fafafa;
        }}

        h1, h2 {{
            color: #1f2937;
        }}

        h3 {{
            margin: 0 0 10px 0;
            color: #111827;
        }}

        h4 {{
            margin: 0 0 8px 0;
            color: #374151;
        }}

        .resumen {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 12px;
            margin-bottom: 24px;
        }}

        .dato {{
            background-color: white;
            border: 1px solid #ddd;
            padding: 12px;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 28px;
            background-color: white;
        }}

        th, td {{
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
            vertical-align: top;
        }}

        th {{
            background-color: #eef2f7;
        }}

        .comparativo {{
            background-color: white;
            border: 1px solid #d7dde7;
            margin-bottom: 18px;
            padding: 14px;
        }}

        .meta {{
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 12px;
        }}

        .meta span {{
            background-color: #eef2f7;
            border: 1px solid #d7dde7;
            padding: 5px 8px;
            font-size: 13px;
        }}

        .columnas-comparativo {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 12px;
        }}

        .columnas-comparativo section {{
            border: 1px solid #e5e7eb;
            background-color: #fbfcfe;
            padding: 10px;
        }}

        pre {{
            margin: 0;
            max-height: 360px;
            overflow: auto;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            font-family: Consolas, "Courier New", monospace;
            font-size: 12px;
            line-height: 1.45;
        }}
    </style>
</head>
<body>
    <h1>Extraccion automatica de datos desde facturas</h1>

    <div class="resumen">
        <div class="dato">Facturas incluidas en la POC: {total_facturas}</div>
        <div class="dato">Procesadas correctamente: {procesadas}</div>
        <div class="dato">Requieren revision: {requieren_revision}</div>
        <div class="dato">Con error: {len(archivos_con_error)}</div>
    </div>

    <h2>Comparativo OCR vs Ollama</h2>
    {comparativo}

    <h2>Resultados</h2>
    {tabla_resultados}

    <h2>Errores</h2>
    {tabla_errores}
</body>
</html>
"""

        ruta_reporte = Path(ruta_reporte)
        ruta_reporte.parent.mkdir(parents=True, exist_ok=True)
        ruta_reporte.write_text(html, encoding="utf-8")

        return True
    except Exception as error:
        print(f"Error al generar reporte HTML: {error}")
        return False
