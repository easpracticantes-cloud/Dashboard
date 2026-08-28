"""API HTTP para la interfaz Angular. Reutiliza el flujo OCR + Ollama existente."""

import os
import shutil
import sys
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.routers.autobits import router as autobits_router
from api.routers.crossings import router as crossings_router
from api.routers.cruce_excel import router as cruce_excel_router
from api.routers.documents import router as documents_router
from api.routers.dashboard import router as dashboard_router
from api.routers.packages import router as packages_router
from api.routers.payments import router as payments_router
from api.routers.remediations import router as remediations_router
from infrastructure.persistence.database import init_db

# Permite importar los modulos de src/
SRC_DIR = Path(__file__).resolve().parent
PROYECTO_RAIZ = SRC_DIR.parent
sys.path.insert(0, str(SRC_DIR))

if not os.environ.get("TESSERACT_CMD"):
    ruta_tesseract = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
    if ruta_tesseract.exists():
        os.environ["TESSERACT_CMD"] = str(ruta_tesseract)

from procesador_interactivo import (  # noqa: E402
    CARPETA_SALIDAS_APP,
    procesar_archivos,
    verificar_dependencias,
)

CARPETA_UPLOADS = CARPETA_SALIDAS_APP / "uploads"
CARPETA_FRONTEND = PROYECTO_RAIZ / "frontend" / "dist" / "frontend" / "browser"

app = FastAPI(title="Sistema Contable IA API", version="1.10.0")

app.include_router(dashboard_router)
app.include_router(documents_router)
app.include_router(autobits_router)
app.include_router(crossings_router)
app.include_router(cruce_excel_router)
app.include_router(remediations_router)
app.include_router(payments_router)
app.include_router(packages_router)


@app.on_event("startup")
def on_startup():
    """Inicializa SQLite al arrancar."""
    init_db()


def _cors_origins() -> list[str]:
    """Orígenes permitidos. APP_CORS_ORIGINS separados por coma; '*' por defecto."""
    raw = os.environ.get("APP_CORS_ORIGINS", "*").strip()
    if not raw or raw == "*":
        return ["*"]
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]


_origins = _cors_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    # allow_credentials con '*' es inválido en navegadores; solo se activa
    # cuando el SIG declara sus orígenes explícitamente.
    allow_credentials=_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    """Estado de Tesseract y Ollama."""
    errores = verificar_dependencias()
    return {
        "ok": len(errores) == 0,
        "errores": errores,
        "tesseract": "Tesseract OCR no esta disponible." not in errores,
        "ollama": "Ollama no responde en http://localhost:11434." not in errores,
    }


@app.post("/api/procesar")
async def procesar(
    solicitud: str = Form(...),
    archivos: list[UploadFile] = File(...),
):
    """Recibe facturas + solicitud del usuario y ejecuta OCR + IA."""
    CARPETA_UPLOADS.mkdir(parents=True, exist_ok=True)

    lote_id = uuid.uuid4().hex[:10]
    rutas_guardadas = []
    previews = {}

    for archivo in archivos:
        nombre_original = Path(archivo.filename or "factura.jpg").name
        destino = CARPETA_UPLOADS / f"{lote_id}_{nombre_original}"
        with destino.open("wb") as salida:
            shutil.copyfileobj(archivo.file, salida)
        rutas_guardadas.append(destino)
        previews[nombre_original] = f"/api/preview/{destino.name}"

    resultado = procesar_archivos(rutas_guardadas, solicitud)

    for item in resultado.get("resultados", []):
        nombre = item.get("archivo", "")
        # Quitar prefijo del lote para mostrar nombre limpio
        if nombre.startswith(f"{lote_id}_"):
            nombre_limpio = nombre[len(lote_id) + 1 :]
            item["archivo"] = nombre_limpio
            item["preview_url"] = previews.get(nombre_limpio, "")
        else:
            item["preview_url"] = previews.get(nombre, "")

    return resultado


@app.get("/api/preview/{nombre_archivo}")
def preview(nombre_archivo: str):
    """Sirve una imagen subida para la vista previa."""
    ruta = CARPETA_UPLOADS / Path(nombre_archivo).name
    if not ruta.exists():
        return {"error": "Archivo no encontrado"}
    return FileResponse(ruta)


class SpaStaticFiles(StaticFiles):
    """Sirve el build de Angular devolviendo index.html en rutas del router.

    Sin esto, recargar la página en /cruce o /pagos daría 404.
    """

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404 and not path.startswith("api"):
                return await super().get_response("index.html", scope)
            raise


# Sirve el build de Angular si existe (modo produccion / launcher).
if CARPETA_FRONTEND.exists():
    app.mount("/", SpaStaticFiles(directory=str(CARPETA_FRONTEND), html=True), name="frontend")


def main():
    """Arranca el servidor web (use run_web.py para el flujo normal)."""
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("APP_HOST", "127.0.0.1"),
        port=int(os.environ.get("APP_PORT", "8787")),
        reload=False,
    )


if __name__ == "__main__":
    main()
