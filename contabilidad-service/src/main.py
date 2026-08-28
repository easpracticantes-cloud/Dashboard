"""Orquestador principal de la POC OCR + Ollama para facturas."""

from pathlib import Path

from exportador import (
    CAMPOS_ERRORES,
    CAMPOS_RESULTADOS,
    guardar_error_csv,
    guardar_json,
    guardar_resultado_csv,
    guardar_texto,
    preparar_csv,
)
from ia_ollama import analizar_factura_con_ollama, verificar_ollama
from ocr import extraer_texto_con_fallback, verificar_tesseract
from preprocesamiento import preprocesar_imagen
from reporte import generar_reporte_html
from validador import validar_factura


CARPETA_IMAGENES = Path("dataset") / "imagenes"
CARPETA_SALIDAS = Path("salidas")
CARPETA_PREPROCESADAS = CARPETA_SALIDAS / "imagenes_preprocesadas"
CARPETA_TEXTOS = CARPETA_SALIDAS / "texto_extraido"
CARPETA_JSON = CARPETA_SALIDAS / "json"
RUTA_RESULTADOS = CARPETA_SALIDAS / "resultados.csv"
RUTA_ERRORES = CARPETA_SALIDAS / "errores.csv"
RUTA_REPORTE = CARPETA_SALIDAS / "reporte.html"
MIN_CARACTERES_OCR = 100
MAX_FACTURAS_REPORTE = 10


def crear_carpetas():
    """Crea las carpetas necesarias para entrada y salida."""
    carpetas = [
        CARPETA_IMAGENES,
        CARPETA_PREPROCESADAS,
        CARPETA_TEXTOS,
        CARPETA_JSON,
    ]

    for carpeta in carpetas:
        carpeta.mkdir(parents=True, exist_ok=True)


def buscar_imagenes():
    """Busca imagenes de facturas en dataset/imagenes."""
    imagenes = []
    extensiones = ("*.jpg", "*.jpeg", "*.png")

    for extension in extensiones:
        imagenes.extend(CARPETA_IMAGENES.rglob(extension))

    return sorted(imagenes)


def crear_resultado_base(nombre_archivo, estado, observaciones):
    """Crea una fila basica cuando no se logra procesar una imagen."""
    return {
        "archivo": nombre_archivo,
        "tipo_documento": "",
        "numero_factura": "",
        "proveedor": "",
        "nit_o_identificacion": "",
        "fecha_emision": "",
        "subtotal": "",
        "impuesto": "",
        "total": "",
        "moneda": "",
        "concepto_general": "",
        "metodo_ocr": "",
        "caracteres_original": "",
        "caracteres_preprocesada": "",
        "campos_faltantes": "",
        "requiere_revision": True,
        "estado": estado,
        "observaciones": observaciones,
    }


def procesar_imagen(ruta_imagen):
    """Procesa una sola imagen de factura."""
    nombre_archivo = ruta_imagen.name
    print(f"Procesando {nombre_archivo}...")

    ruta_preprocesada = CARPETA_PREPROCESADAS / f"{ruta_imagen.stem}.png"
    ruta_texto = CARPETA_TEXTOS / f"{ruta_imagen.stem}.txt"
    ruta_json = CARPETA_JSON / f"{ruta_imagen.stem}.json"

    try:
        if not preprocesar_imagen(ruta_imagen, ruta_preprocesada):
            guardar_error_csv(nombre_archivo, "PREPROCESAMIENTO", "No se pudo preprocesar la imagen")
            ruta_preprocesada = None
            print("ERROR en PREPROCESAMIENTO")

        (
            texto_ocr,
            metodo_ocr,
            caracteres_original,
            caracteres_preprocesada,
        ) = extraer_texto_con_fallback(ruta_imagen, ruta_preprocesada)

        print(f"OCR usado: {metodo_ocr}")
        guardar_texto(ruta_texto, texto_ocr)

        if caracteres_original < MIN_CARACTERES_OCR:
            guardar_error_csv(
                nombre_archivo,
                "OCR",
                f"OCR original debil: {caracteres_original} caracteres",
            )

        if ruta_preprocesada and caracteres_preprocesada < MIN_CARACTERES_OCR:
            guardar_error_csv(
                nombre_archivo,
                "OCR",
                f"OCR preprocesado debil: {caracteres_preprocesada} caracteres",
            )

        if len(texto_ocr.strip()) < MIN_CARACTERES_OCR:
            guardar_error_csv(
                nombre_archivo,
                "OCR",
                "Ambos OCR son debiles",
            )
            resultado_error = crear_resultado_base(
                nombre_archivo,
                "revisar",
                "ERROR en OCR: ambos textos son debiles",
            )
            resultado_error["metodo_ocr"] = metodo_ocr
            resultado_error["caracteres_original"] = caracteres_original
            resultado_error["caracteres_preprocesada"] = caracteres_preprocesada
            guardar_resultado_csv(resultado_error)
            print("ERROR en OCR")
            return "error"

        datos = analizar_factura_con_ollama(texto_ocr)

        if not datos:
            guardar_error_csv(nombre_archivo, "OLLAMA", "No se obtuvo JSON desde Ollama")
            resultado_error = crear_resultado_base(
                nombre_archivo,
                "revisar",
                "ERROR en Ollama o JSON",
            )
            resultado_error["metodo_ocr"] = metodo_ocr
            resultado_error["caracteres_original"] = caracteres_original
            resultado_error["caracteres_preprocesada"] = caracteres_preprocesada
            guardar_resultado_csv(resultado_error)
            print("ERROR en OLLAMA")
            return "error"

        guardar_json(ruta_json, datos)

        datos_validados, estado, observaciones = validar_factura(datos)
        datos_validados["archivo"] = nombre_archivo
        datos_validados["metodo_ocr"] = metodo_ocr
        datos_validados["caracteres_original"] = caracteres_original
        datos_validados["caracteres_preprocesada"] = caracteres_preprocesada
        datos_validados["estado"] = estado
        datos_validados["observaciones"] = observaciones

        guardar_resultado_csv(datos_validados)

        try:
            from application.services.document_processing_service import (
                get_document_processing_service,
            )

            get_document_processing_service().persist_batch_side_effect(
                ruta_imagen,
                datos_validados,
                metodo_ocr,
                texto_ocr,
                estado,
                observaciones,
            )
        except Exception:
            pass  # Persistencia SQLite opcional; no rompe batch legacy

        if estado == "revisar" or datos_validados.get("requiere_revision"):
            print("Requiere revision")
            return "revision"

        print("OK")
        return "ok"
    except Exception as error:
        guardar_error_csv(nombre_archivo, "GENERAL", error)
        guardar_resultado_csv(
            crear_resultado_base(nombre_archivo, "revisar", f"ERROR general: {error}")
        )
        print("ERROR GENERAL")
        return "error"


def main():
    """Ejecuta el procesamiento por lotes de facturas."""
    print("POC: Extraccion automatica de datos desde facturas en imagen usando OCR + Ollama")

    crear_carpetas()

    # Reiniciamos los CSV de la corrida actual.
    preparar_csv(RUTA_RESULTADOS, CAMPOS_RESULTADOS)
    preparar_csv(RUTA_ERRORES, CAMPOS_ERRORES)

    imagenes = buscar_imagenes()

    total_encontradas = len(imagenes)
    imagenes = imagenes[:MAX_FACTURAS_REPORTE]

    if not imagenes:
        print("No se encontraron imagenes en dataset/imagenes.")
        generar_reporte_html(
            RUTA_RESULTADOS,
            RUTA_ERRORES,
            RUTA_REPORTE,
            total_facturas=0,
        )
        return

    if not verificar_tesseract():
        guardar_error_csv(
            "TODAS",
            "OCR",
            "Tesseract OCR no esta instalado o no esta en el PATH",
        )
        generar_reporte_html(
            RUTA_RESULTADOS,
            RUTA_ERRORES,
            RUTA_REPORTE,
            total_facturas=len(imagenes),
        )
        return

    if not verificar_ollama():
        guardar_error_csv(
            "TODAS",
            "OLLAMA",
            "Ollama no esta respondiendo en http://localhost:11434",
        )
        generar_reporte_html(
            RUTA_RESULTADOS,
            RUTA_ERRORES,
            RUTA_REPORTE,
            total_facturas=len(imagenes),
        )
        return

    total_ok = 0
    total_revision = 0
    total_error = 0

    for ruta_imagen in imagenes:
        resultado = procesar_imagen(ruta_imagen)

        if resultado == "ok":
            total_ok += 1
        elif resultado == "revision":
            total_revision += 1
        else:
            total_error += 1

    generar_reporte_html(
        RUTA_RESULTADOS,
        RUTA_ERRORES,
        RUTA_REPORTE,
        total_facturas=len(imagenes),
    )

    print("Proceso finalizado.")
    print(f"Facturas encontradas: {total_encontradas}")
    print(f"Facturas usadas en la POC: {len(imagenes)}")
    print(f"Procesadas correctamente: {total_ok}")
    print(f"Requieren revision: {total_revision}")
    print(f"Con error: {total_error}")
    print(f"Reporte generado en: {RUTA_REPORTE}")


if __name__ == "__main__":
    main()
