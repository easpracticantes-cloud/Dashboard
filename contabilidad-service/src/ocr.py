"""Funciones simples para extraer texto con OCR."""

import os
from pathlib import Path


TIMEOUT_OCR = 10
MIN_CARACTERES_OCR_DEBIL = 100
MIN_MEJORA_CARACTERES = 100
MIN_MEJORA_PORCENTAJE = 0.10

PALABRAS_CLAVE_FACTURA = [
    "Invoice",
    "Date of issue",
    "Seller",
    "Client",
    "Tax Id",
    "ITEMS",
    "SUMMARY",
    "Total",
    "Gross worth",
    # Español / DIAN / cuentas de cobro físicas
    "Factura",
    "NIT",
    "IVA",
    "CUFE",
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
]


def configurar_tesseract():
    """Configura Tesseract si esta instalado en una ruta comun de Windows."""
    try:
        import pytesseract

        # Si el usuario define esta variable, usamos esa ruta.
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

        # Si esta en el PATH, pytesseract lo encontrara sin ruta manual.
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
    """Extrae texto de una imagen usando pytesseract (multi-PSM)."""
    try:
        import pytesseract
        from PIL import Image

        from config.settings import get_settings
        from infrastructure.ocr.pdf_rasterize import ensure_raster_image, is_pdf

        configurar_tesseract()

        ruta = Path(ruta_imagen)
        if is_pdf(ruta):
            raster = ensure_raster_image(ruta)
            ruta = raster

        imagen = Image.open(ruta)
        if imagen.mode not in ("RGB", "L"):
            imagen = imagen.convert("RGB")

        # Fotos de celular / facturas físicas: subir a 1800px mínimo
        w, h = imagen.size
        if max(w, h) < 1800:
            scale = 1800 / max(w, h)
            imagen = imagen.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

        lang = (get_settings().tesseract_lang or "spa+eng").strip() or "spa+eng"
        if "eng" not in lang and "spa" in lang:
            lang = "spa+eng"
        configs = [
            "--oem 3 --psm 6",
            "--oem 3 --psm 4",
            "--oem 3 --psm 3",
            "--oem 3 --psm 11",
            "--oem 3 --psm 1",
            "--oem 3 --psm 12",
        ]
        mejores = []
        for cfg in configs:
            try:
                texto = pytesseract.image_to_string(
                    imagen, lang=lang, config=cfg, timeout=max(TIMEOUT_OCR, 45)
                )
            except Exception:
                try:
                    texto = pytesseract.image_to_string(
                        imagen, lang="spa", config=cfg, timeout=max(TIMEOUT_OCR, 45)
                    )
                except Exception:
                    texto = ""
            if texto:
                mejores.append(texto)
        if not mejores:
            return ""
        return max(mejores, key=lambda t: calcular_puntaje_ocr(t)["puntaje"])
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

    # Cada palabra clave vale bastante porque indica que el OCR entiende la factura.
    puntaje = caracteres + (palabras_encontradas * 100)

    return {
        "caracteres": caracteres,
        "palabras_clave": palabras_encontradas,
        "puntaje": puntaje,
    }


def extraer_texto_con_fallback(ruta_original, ruta_preprocesada=None):
    """Prueba OCR original y preprocesado, prefiriendo original por defecto."""
    texto_original = extraer_texto_imagen(ruta_original)
    puntaje_original = calcular_puntaje_ocr(texto_original)
    caracteres_original = puntaje_original["caracteres"]

    texto_preprocesado = ""
    puntaje_preprocesado = calcular_puntaje_ocr(texto_preprocesado)
    caracteres_preprocesada = 0

    if ruta_preprocesada and Path(ruta_preprocesada).exists():
        from preprocesamiento import variantes_preprocesadas

        candidatos = []
        for variante in variantes_preprocesadas(ruta_preprocesada) or [Path(ruta_preprocesada)]:
            texto_v = extraer_texto_imagen(variante)
            if texto_v:
                candidatos.append((calcular_puntaje_ocr(texto_v), texto_v))
        if candidatos:
            puntaje_preprocesado, texto_preprocesado = max(
                candidatos, key=lambda item: item[0]["puntaje"]
            )
            caracteres_preprocesada = puntaje_preprocesado["caracteres"]

    mejora_caracteres = caracteres_preprocesada - caracteres_original
    mejora_porcentaje = 0

    if caracteres_original > 0:
        mejora_porcentaje = mejora_caracteres / caracteres_original

    mejora_clara = (
        mejora_caracteres >= MIN_MEJORA_CARACTERES
        or mejora_porcentaje >= MIN_MEJORA_PORCENTAJE
    )

    mantiene_palabras_clave = (
        puntaje_preprocesado["palabras_clave"]
        >= puntaje_original["palabras_clave"]
    )

    # Preferimos ORIGINAL. Solo usamos PREPROCESADA si mejora claramente
    # y no pierde palabras clave importantes de la factura.
    if mejora_clara and mantiene_palabras_clave:
        texto_final = texto_preprocesado
        metodo_usado = "PREPROCESADA"
    else:
        texto_final = texto_original
        metodo_usado = "ORIGINAL"

    return (
        texto_final,
        metodo_usado,
        caracteres_original,
        caracteres_preprocesada,
    )
