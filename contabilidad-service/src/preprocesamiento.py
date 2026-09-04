"""Funciones para preparar imagenes antes del OCR (facturas fisicas / escaneos)."""

from pathlib import Path


ANCHO_MINIMO = 1400
ANCHO_MAXIMO = 2800


def preprocesar_imagen(ruta_entrada, ruta_salida):
    """Preprocesamiento robusto: PDF→PNG, deskew suave, CLAHE, umbral adaptativo."""
    try:
        import cv2
        import numpy as np

        from infrastructure.ocr.pdf_rasterize import ensure_raster_image

        ruta_entrada = Path(ruta_entrada)
        ruta_salida = Path(ruta_salida)
        ruta_entrada = ensure_raster_image(ruta_entrada, ruta_salida.parent)

        imagen = cv2.imread(str(ruta_entrada))
        if imagen is None:
            # Pillow fallback (algunos JPEG/WEBP raros)
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
                interpolation=cv2.INTER_CUBIC,
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

        # Deskew ligero por proyección de bordes
        try:
            edges = cv2.Canny(gris, 50, 150)
            coords = np.column_stack(np.where(edges > 0))
            if len(coords) > 80:
                angle = cv2.minAreaRect(coords)[-1]
                if angle < -45:
                    angle = 90 + angle
                if abs(angle) > 0.4 and abs(angle) < 15:
                    (h, w) = gris.shape
                    M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
                    gris = cv2.warpAffine(
                        gris, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
                    )
        except Exception:
            pass

        clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
        gris = clahe.apply(gris)
        gris = cv2.bilateralFilter(gris, 5, 50, 50)

        # Variante binaria + mezcla suave para texto fino
        binaria = cv2.adaptiveThreshold(
            gris, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
        )
        mezcla = cv2.addWeighted(gris, 0.55, binaria, 0.45, 0)

        ruta_salida.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(ruta_salida), mezcla)
        return True
    except Exception as error:
        print(f"ERROR en preprocesamiento: {error}")
        return False
