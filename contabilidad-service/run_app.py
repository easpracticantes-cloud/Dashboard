"""Lanza Sistema Contable IA (aplicacion web)."""

import runpy
from pathlib import Path


if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).resolve().parent / "run_web.py"), run_name="__main__")
