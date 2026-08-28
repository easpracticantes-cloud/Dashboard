"""
Empaqueta el proyecto completo para entregarlo a otro equipo (integración SIG).

Uso:
  python scripts/empaquetar_integracion.py
  python scripts/empaquetar_integracion.py --dest "C:\\Users\\07sam\\Downloads"

Incluye: código fuente, tests, docs, assets, dataset, frontend/dist compilado,
requirements-lock.txt, scripts, launchers.

Excluye solo artefactos regenerables: venv, node_modules, __pycache__, .pytest_cache,
.angular/cache, logs en salidas/.
"""

from __future__ import annotations

import argparse
import os
import zipfile
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
NOMBRE_CARPETA = "Sistema_Contable_IA"

EXCLUIR_DIR = {
    "venv",
    ".venv",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".angular",
    ".git",
    ".cursor",
}

EXCLUIR_ARCHIVO = {
    ".pyc",
    ".pyo",
    ".log",
    ".tmp",
    ".temp",
}


def debe_incluir(ruta: Path) -> bool:
    partes = set(ruta.parts)
    if partes & EXCLUIR_DIR:
        return False
    if ruta.suffix.lower() in EXCLUIR_ARCHIVO:
        return False
    if ruta.name == ".env":
        return False
    return True


def recoger_archivos() -> list[Path]:
    archivos: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(RAIZ):
        dirnames[:] = [d for d in dirnames if d not in EXCLUIR_DIR]
        base = Path(dirpath)
        for nombre in filenames:
            ruta = base / nombre
            rel = ruta.relative_to(RAIZ)
            if debe_incluir(rel):
                archivos.append(rel)
    return sorted(archivos)


def escribir_manifest(archivos: list[Path], destino: Path) -> None:
    lineas = [
        "MANIFEST — Sistema Contable IA",
        f"Fecha: {date.today().isoformat()}",
        f"Archivos: {len(archivos)}",
        "",
    ]
    lineas.extend(str(a).replace("\\", "/") for a in archivos)
    destino.write_text("\n".join(lineas), encoding="utf-8")


def empaquetar(dest_dir: Path) -> Path:
    archivos = recoger_archivos()
    manifest_rel = Path("MANIFEST.txt")
    escribir_manifest(archivos, RAIZ / manifest_rel)
    if manifest_rel not in archivos:
        archivos.append(manifest_rel)

    dest_dir.mkdir(parents=True, exist_ok=True)
    zip_path = dest_dir / f"{NOMBRE_CARPETA}_Integracion_{date.today().isoformat()}.zip"

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for rel in archivos:
            fuente = RAIZ / rel
            if not fuente.is_file():
                continue
            arcname = f"{NOMBRE_CARPETA}/{rel.as_posix()}"
            zf.write(fuente, arcname)

    mb = zip_path.stat().st_size / (1024 * 1024)
    print(f"ZIP creado: {zip_path}")
    print(f"Tamaño: {mb:.1f} MB | Archivos: {len(archivos)}")
    return zip_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Empaquetar Sistema Contable IA para integración")
    parser.add_argument(
        "--dest",
        type=Path,
        default=RAIZ.parent,
        help="Carpeta donde guardar el ZIP (por defecto: carpeta padre del proyecto)",
    )
    args = parser.parse_args()
    empaquetar(args.dest.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
