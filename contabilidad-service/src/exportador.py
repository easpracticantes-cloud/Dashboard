"""Funciones simples para guardar salidas del proceso."""

import csv
import json
from pathlib import Path


CAMPOS_RESULTADOS = [
    "archivo",
    "tipo_documento",
    "numero_factura",
    "proveedor",
    "nit_o_identificacion",
    "fecha_emision",
    "subtotal",
    "impuesto",
    "total",
    "moneda",
    "concepto_general",
    "metodo_ocr",
    "caracteres_original",
    "caracteres_preprocesada",
    "campos_faltantes",
    "requiere_revision",
    "estado",
    "observaciones",
]

CAMPOS_ERRORES = ["archivo", "etapa", "error"]


def preparar_csv(ruta_csv, campos):
    """Crea un CSV nuevo con encabezados."""
    ruta_csv = Path(ruta_csv)
    ruta_csv.parent.mkdir(parents=True, exist_ok=True)

    with ruta_csv.open("w", newline="", encoding="utf-8") as archivo_csv:
        escritor = csv.DictWriter(archivo_csv, fieldnames=campos)
        escritor.writeheader()


def guardar_texto(ruta_salida, texto):
    """Guarda texto OCR en un archivo .txt."""
    try:
        ruta_salida = Path(ruta_salida)
        ruta_salida.parent.mkdir(parents=True, exist_ok=True)
        ruta_salida.write_text(texto, encoding="utf-8")
        return True
    except Exception as error:
        print(f"Error al guardar texto: {error}")
        return False


def guardar_json(ruta_salida, datos):
    """Guarda los datos extraidos en un archivo JSON."""
    try:
        ruta_salida = Path(ruta_salida)
        ruta_salida.parent.mkdir(parents=True, exist_ok=True)

        with ruta_salida.open("w", encoding="utf-8") as archivo_json:
            json.dump(datos, archivo_json, ensure_ascii=False, indent=2)

        return True
    except Exception as error:
        print(f"Error al guardar JSON: {error}")
        return False


def guardar_resultado_csv(resultado, ruta_csv="salidas/resultados.csv"):
    """Agrega una fila al CSV de resultados."""
    try:
        ruta_csv = Path(ruta_csv)
        ruta_csv.parent.mkdir(parents=True, exist_ok=True)
        archivo_existe = ruta_csv.exists()

        with ruta_csv.open("a", newline="", encoding="utf-8") as archivo_csv:
            escritor = csv.DictWriter(archivo_csv, fieldnames=CAMPOS_RESULTADOS)

            if not archivo_existe:
                escritor.writeheader()

            fila = {}
            for campo in CAMPOS_RESULTADOS:
                valor = resultado.get(campo, "")

                # Las listas se guardan como texto separado por coma.
                if isinstance(valor, list):
                    valor = ", ".join(str(item) for item in valor)

                fila[campo] = valor

            escritor.writerow(fila)

        return True
    except Exception as error:
        print(f"Error al guardar resultado en CSV: {error}")
        return False


def guardar_error_csv(archivo, etapa, error, ruta_csv="salidas/errores.csv"):
    """Agrega una fila al CSV de errores."""
    try:
        ruta_csv = Path(ruta_csv)
        ruta_csv.parent.mkdir(parents=True, exist_ok=True)
        archivo_existe = ruta_csv.exists()

        with ruta_csv.open("a", newline="", encoding="utf-8") as archivo_csv:
            escritor = csv.DictWriter(archivo_csv, fieldnames=CAMPOS_ERRORES)

            if not archivo_existe:
                escritor.writeheader()

            escritor.writerow(
                {
                    "archivo": archivo,
                    "etapa": etapa,
                    "error": str(error),
                }
            )

        return True
    except Exception as error_general:
        print(f"Error al guardar error en CSV: {error_general}")
        return False
