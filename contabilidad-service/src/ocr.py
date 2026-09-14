"""Funciones simples para extraer texto con OCR (hot path rápido)."""

import os
from pathlib import Path


TIMEOUT_OCR = 8
MIN_CARACTERES_OCR_DEBIL = 100
MIN_MEJORA_CARACTERES = 100
MIN_MEJORA_PORCENTAJE = 0.10
# Un solo PSM: suficiente para facturas y evita ~6× el tiempo anterior.
OCR_PSM_CONFIG = "--oem 3 --psm 6"
MAX_SIDE_PX = 1400

PALABRAS_CLAVE_FACTURA = [
    "Invoice",
    "Date of issue",
    "Seller",
    "Client",
    "Tax Id",
    "Tax ID",
    "ITEMS",
    "SUMMARY",
    "Total",
    "Gross worth",
    "Amount due",
    "Bill to",
    "Factura",
    "NIT",
    "IVA",
    "CUFE",
    "RUT",
    "Razón social",
    "Razon social",
    "Fecha",
    "Subtotal",
    "Total a pagar",
    "Cuenta de cobro",
    "Proveedor",
    "Resolución",
    "Resolucion",
    "FPOS",
    "FE POS",
    "FV POS",
    "Cuenta de Cobro",
    "Régimen",
    "Regimen",
    "Autoriza",
    "DIAN",
    "CUNE",
    "Valor total",
]


def configurar_tesseract():
    """Configura Tesseract si esta instalado en una ruta comun de Windows."""
    try:
        import pytesseract

        ruta_desde_variable = os.environ.get("TESSERACT_CMD")
        posibles_rutas = [
            ruta_desde_variable,
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ]
        for ruta in posibles_rutas:
            if ruta and Path(ruta).exists():
                pytesseract.pytesseract.tesseract_cmd = ruta
                return True
        return True
    except Exception:
        return False


def verificar_tesseract():
    """Revisa si Tesseract OCR esta disponible antes de iniciar el lote."""
    try:
        import pytesseract

        configurar_tesseract()
        pytesseract.get_tesseract_version()
        return True
    except Exception as error:
        print("ERROR: Tesseract OCR no esta instalado o no esta en el PATH.")
        print(f"Detalle: {error}")
        print("Instala Tesseract OCR y vuelve a ejecutar el proyecto.")
        print("Ruta comun en Windows: C:\\Program Files\\Tesseract-OCR\\tesseract.exe")
        return False


def extraer_texto_imagen(ruta_imagen):
    """Extrae texto con un solo PSM (objetivo ≤8s por imagen)."""
    try:
        import pytesseract
        from PIL import Image

        from config.settings import get_settings
        from infrastructure.ocr.pdf_rasterize import ensure_raster_image, is_pdf

        configurar_tesseract()

        ruta = Path(ruta_imagen)
        if is_pdf(ruta):
            ruta = ensure_raster_image(ruta)

        imagen = Image.open(ruta)
        if imagen.mode not in ("RGB", "L"):
            imagen = imagen.convert("RGB")

        w, h = imagen.size
        longest = max(w, h)
        if longest > MAX_SIDE_PX:
            scale = MAX_SIDE_PX / longest
            imagen = imagen.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
        elif longest < 900:
            scale = 900 / longest
            imagen = imagen.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

        lang = (get_settings().tesseract_lang or "spa+eng").strip() or "spa+eng"
        if "eng" not in lang and "spa" in lang:
            lang = "spa+eng"

        try:
            texto = pytesseract.image_to_string(
                imagen, lang=lang, config=OCR_PSM_CONFIG, timeout=TIMEOUT_OCR
            )
        except Exception:
            try:
                texto = pytesseract.image_to_string(
                    imagen, lang="spa", config=OCR_PSM_CONFIG, timeout=TIMEOUT_OCR
                )
            except Exception:
                texto = ""
        return texto or ""
    except Exception as error:
        print(f"ERROR en OCR: {error}")
        return ""


def contar_caracteres_utiles(texto):
    """Cuenta caracteres no vacios para comparar resultados OCR."""
    return len(texto.strip())


def calcular_puntaje_ocr(texto):
    """Calcula un puntaje simple segun caracteres y palabras clave."""
    texto_normalizado = texto.lower()
    caracteres = contar_caracteres_utiles(texto)
    palabras_encontradas = 0
    for palabra in PALABRAS_CLAVE_FACTURA:
        if palabra.lower() in texto_normalizado:
            palabras_encontradas += 1
    puntaje = caracteres + (palabras_encontradas * 100)
    return {
        "caracteres": caracteres,
        "palabras_clave": palabras_encontradas,
        "puntaje": puntaje,
    }


def extraer_texto_con_fallback(ruta_original, ruta_preprocesada=None):
    """OCR rápido: original primero; preprocesada solo si existe y mejora."""
    texto_original = extraer_texto_imagen(ruta_original)
    puntaje_original = calcular_puntaje_ocr(texto_original)
    caracteres_original = puntaje_original["caracteres"]

    texto_preprocesado = ""
    puntaje_preprocesado = calcular_puntaje_ocr(texto_preprocesado)
    caracteres_preprocesada = 0

    # Solo la variante principal (sin otsu/inv) para no multiplicar el tiempo.
    if ruta_preprocesada and Path(ruta_preprocesada).exists():
        texto_preprocesado = extraer_texto_imagen(ruta_preprocesada)
        puntaje_preprocesado = calcular_puntaje_ocr(texto_preprocesado)
        caracteres_preprocesada = puntaje_preprocesado["caracteres"]

    mejora_caracteres = caracteres_preprocesada - caracteres_original
    mejora_porcentaje = (
        mejora_caracteres / caracteres_original if caracteres_original > 0 else 0
    )
    mejora_clara = (
        mejora_caracteres >= MIN_MEJORA_CARACTERES
        or mejora_porcentaje >= MIN_MEJORA_PORCENTAJE
    )
    mantiene_palabras_clave = (
        puntaje_preprocesado["palabras_clave"] >= puntaje_original["palabras_clave"]
    )

    if mejora_clara and mantiene_palabras_clave and texto_preprocesado:
        return texto_preprocesado, "PREPROCESADA", caracteres_original, caracteres_preprocesada
    return texto_original, "ORIGINAL", caracteres_original, caracteres_preprocesada
