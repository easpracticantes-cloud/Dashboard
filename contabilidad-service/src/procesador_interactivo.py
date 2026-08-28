"""Procesamiento interactivo — delega al servicio unificado (Fase 1)."""

from pathlib import Path

from application.services.document_processing_service import get_document_processing_service
from exportador import guardar_texto  # re-export compat
from ia_ollama import verificar_ollama
from ocr import verificar_tesseract


PROYECTO_RAIZ = Path(__file__).resolve().parent.parent
CARPETA_SALIDAS_APP = PROYECTO_RAIZ / "salidas" / "app"
CARPETA_PREPROCESADAS = CARPETA_SALIDAS_APP / "imagenes_preprocesadas"
CARPETA_TEXTOS = CARPETA_SALIDAS_APP / "texto_extraido"
CARPETA_RESPUESTAS = CARPETA_SALIDAS_APP / "respuestas"
MIN_CARACTERES_OCR = 100


def crear_carpetas_app():
    """Crea carpetas de salida exclusivas de la app."""
    for carpeta in (CARPETA_PREPROCESADAS, CARPETA_TEXTOS, CARPETA_RESPUESTAS):
        carpeta.mkdir(parents=True, exist_ok=True)


def verificar_dependencias():
    """Revisa Tesseract y Ollama antes de procesar."""
    service = get_document_processing_service()
    return service.verify_dependencies()


def procesar_archivo(ruta_imagen, solicitud_usuario):
    """Procesa una imagen con OCR y la solicitud personalizada."""
    service = get_document_processing_service()
    return service.process_interactive(Path(ruta_imagen), solicitud_usuario)


def procesar_archivos(rutas_imagenes, solicitud_usuario, callback_progreso=None):
    """Procesa varias imagenes con la misma solicitud del usuario."""
    crear_carpetas_app()

    errores_dependencias = verificar_dependencias()
    if errores_dependencias:
        return {
            "ok": False,
            "resultados": [],
            "error": " ".join(errores_dependencias),
        }

    resultados = []
    total = len(rutas_imagenes)

    for indice, ruta_imagen in enumerate(rutas_imagenes, start=1):
        if callback_progreso:
            callback_progreso(indice, total, Path(ruta_imagen).name)

        resultados.append(procesar_archivo(ruta_imagen, solicitud_usuario))

    return {
        "ok": True,
        "resultados": resultados,
        "error": "",
    }
