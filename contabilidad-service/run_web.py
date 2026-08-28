"""Arranca Sistema Contable IA como aplicacion web.

Variables de entorno:
    APP_HOST        interfaz de escucha (por defecto 127.0.0.1)
                    use 0.0.0.0 para exponerlo en la red / al SIG
    APP_PORT        puerto (por defecto 8787)
    APP_OPEN_BROWSER  1 abre el navegador al arrancar (por defecto 1)
    APP_RELOAD      1 activa recarga automatica (desarrollo)

Ejemplos:
    python run_web.py
    set APP_HOST=0.0.0.0 && python run_web.py
    set APP_OPEN_BROWSER=0 && python run_web.py
"""

from __future__ import annotations

import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
SRC = RAIZ / "src"
FRONTEND = RAIZ / "frontend" / "dist" / "frontend" / "browser" / "index.html"


def _bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "si", "sí", "yes", "y", "on"}


def configurar_tesseract() -> None:
    if os.environ.get("TESSERACT_CMD"):
        return
    tesseract = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
    if tesseract.exists():
        os.environ["TESSERACT_CMD"] = str(tesseract)


def ip_local() -> str | None:
    """IP de la maquina en la red, para compartir la URL."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return None


def abrir_navegador(url: str, host: str, port: int) -> None:
    """Abre el navegador cuando el servidor ya acepta conexiones."""

    def _esperar() -> None:
        destino = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
        limite = time.time() + 30
        while time.time() < limite:
            try:
                with socket.create_connection((destino, port), timeout=0.5):
                    webbrowser.open(url)
                    return
            except OSError:
                time.sleep(0.3)

    threading.Thread(target=_esperar, daemon=True).start()


def main() -> int:
    sys.path.insert(0, str(SRC))
    configurar_tesseract()
    os.chdir(SRC)

    host = os.environ.get("APP_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.environ.get("APP_PORT", "8787"))
    reload_mode = _bool_env("APP_RELOAD", False)

    url_local = f"http://{'127.0.0.1' if host in {'0.0.0.0', '::'} else host}:{port}"

    print("Sistema Contable IA - aplicacion web")
    print(f"  Local:  {url_local}")
    if host in {"0.0.0.0", "::"}:
        ip = ip_local()
        if ip:
            print(f"  Red:    http://{ip}:{port}")
    print(f"  API:    {url_local}/api/health")
    print(f"  Docs:   {url_local}/docs")

    if not FRONTEND.exists():
        print()
        print("AVISO: falta el build de Angular; solo respondera la API.")
        print("  cd frontend && npm install && npm run build")

    if _bool_env("APP_OPEN_BROWSER", True) and FRONTEND.exists():
        abrir_navegador(url_local, host, port)

    import uvicorn

    if reload_mode:
        uvicorn.run("api_server:app", host=host, port=port, reload=True)
    else:
        from api_server import app

        uvicorn.run(app, host=host, port=port, reload=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
