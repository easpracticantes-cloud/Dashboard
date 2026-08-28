"""Funciones simples para preparar imagenes antes del OCR."""

from pathlib import Path


ANCHO_MINIMO = 1200
ANCHO_MAXIMO = 2200


def preprocesar_imagen(ruta_entrada, ruta_salida):
    """Aplica un preprocesamiento suave para OCR."""
    try:
        # Importamos OpenCV aqui para controlar el error si falta instalarlo.
        import cv2

        ruta_entrada = Path(ruta_entrada)
        ruta_salida = Path(ruta_salida)

        # Leemos la imagen original con OpenCV.
        imagen = cv2.imread(str(ruta_entrada))

        if imagen is None:
            raise ValueError("No se pudo leer la imagen.")

        alto, ancho = imagen.shape[:2]

        # Aumentamos imagenes pequenas para que el texto tenga mas detalle.
        if ancho < ANCHO_MINIMO:
            proporcion = ANCHO_MINIMO / ancho
            nuevo_alto = int(alto * proporcion)
            imagen = cv2.resize(imagen, (ANCHO_MINIMO, nuevo_alto))

        alto, ancho = imagen.shape[:2]

        # Reducimos solo imagenes muy grandes para evitar procesos lentos.
        if ancho > ANCHO_MAXIMO:
            proporcion = ANCHO_MAXIMO / ancho
            nuevo_alto = int(alto * proporcion)
            imagen = cv2.resize(imagen, (ANCHO_MAXIMO, nuevo_alto))

        # Convertimos la imagen a escala de grises.
        gris = cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY)

        # Filtro suave para reducir ruido sin destruir los bordes del texto.
        suave = cv2.medianBlur(gris, 3)

        # Creamos la carpeta de salida y guardamos la imagen preprocesada.
        ruta_salida.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(ruta_salida), suave)

        return True
    except Exception as error:
        print(f"ERROR en preprocesamiento: {error}")
        return False
