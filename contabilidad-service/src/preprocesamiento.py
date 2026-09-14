"""Preprocesamiento ligero antes del OCR (sin NlMeans / variantes pesadas)."""

from pathlib import Path


ANCHO_MINIMO = 1000
ANCHO_MAXIMO = 1600


def preprocesar_imagen(ruta_entrada, ruta_salida):
    """Grayscale + contraste rápido. Objetivo: <1s en factura típica."""
    try:
        import cv2
        import numpy as np

        from infrastructure.ocr.pdf_rasterize import ensure_raster_image

        ruta_entrada = Path(ruta_entrada)
        ruta_salida = Path(ruta_salida)
        ruta_entrada = ensure_raster_image(ruta_entrada, ruta_salida.parent)

        imagen = cv2.imread(str(ruta_entrada))
        if imagen is None:
            try:
                from PIL import Image

                pil = Image.open(ruta_entrada).convert("RGB")
                imagen = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
            except Exception as exc:
                raise ValueError(f"No se pudo leer la imagen: {exc}") from exc

        alto, ancho = imagen.shape[:2]
        if ancho < ANCHO_MINIMO:
            proporcion = ANCHO_MINIMO / max(ancho, 1)
            imagen = cv2.resize(
                imagen,
                (ANCHO_MINIMO, max(1, int(alto * proporcion))),
                interpolation=cv2.INTER_AREA,
            )
        alto, ancho = imagen.shape[:2]
        if ancho > ANCHO_MAXIMO:
            proporcion = ANCHO_MAXIMO / ancho
            imagen = cv2.resize(
                imagen,
                (ANCHO_MAXIMO, max(1, int(alto * proporcion))),
                interpolation=cv2.INTER_AREA,
            )

        gris = cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gris = clahe.apply(gris)
        nitida = cv2.convertScaleAbs(gris, alpha=1.15, beta=8)

        ruta_salida.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(ruta_salida), nitida)
        return True
    except Exception as error:
        print(f"ERROR en preprocesamiento: {error}")
        return False


def variantes_preprocesadas(ruta_salida) -> list:
    """Solo la imagen principal (hot path sin variantes extra)."""
    dest = Path(ruta_salida)
    return [dest] if dest.exists() else []
