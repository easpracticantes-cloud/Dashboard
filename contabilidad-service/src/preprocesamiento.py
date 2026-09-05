"""Funciones para preparar imagenes antes del OCR (facturas fisicas / escaneos)."""

from pathlib import Path


ANCHO_MINIMO = 1800
ANCHO_MAXIMO = 3200


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

        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        gris = clahe.apply(gris)
        gris = cv2.fastNlMeansDenoising(gris, None, 11, 7, 21)
        gris = cv2.bilateralFilter(gris, 7, 60, 60)

        # Variante binaria + mezcla para texto impreso / foto
        binaria = cv2.adaptiveThreshold(
            gris, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 35, 9
        )
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        nitida = cv2.filter2D(gris, -1, kernel)
        mezcla = cv2.addWeighted(nitida, 0.6, binaria, 0.4, 0)

        # Otsu + inversión: facturas físicas a color / foto con sombra
        _, otsu = cv2.threshold(gris, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        invertida = cv2.bitwise_not(otsu)

        ruta_salida.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(ruta_salida), mezcla)
        stem = ruta_salida.with_suffix("")
        cv2.imwrite(str(Path(str(stem) + "_otsu.png")), otsu)
        cv2.imwrite(str(Path(str(stem) + "_inv.png")), invertida)
        return True
    except Exception as error:
        print(f"ERROR en preprocesamiento: {error}")
        return False


def variantes_preprocesadas(ruta_salida) -> list:
    """Rutas de variantes generadas junto a la imagen principal."""
    dest = Path(ruta_salida)
    stem = dest.with_suffix("")
    return [p for p in (dest, Path(str(stem) + "_otsu.png"), Path(str(stem) + "_inv.png")) if p.exists()]
