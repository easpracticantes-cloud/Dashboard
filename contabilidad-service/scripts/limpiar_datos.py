"""Deja el sistema en cero: sin facturas, sin Excel de Autobits, sin pagos.

Funciona con la aplicacion abierta: en vez de borrar el archivo de base de
datos (que Windows bloquea), vacia todas las tablas.

Uso:
    python scripts/limpiar_datos.py           # pide confirmacion
    python scripts/limpiar_datos.py --si      # sin confirmacion
    python scripts/limpiar_datos.py --si --conservar-salidas
"""

from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "src"
sys.path.insert(0, str(SRC))

STORAGE = RAIZ / "storage"
DB_PATH = RAIZ / "data" / "contable.db"

# Contenido que se borra por completo (la carpeta se conserva)
CARPETAS_DATOS = [
    STORAGE / "autobits" / "imports",
    STORAGE / "autobits" / "previews",
    STORAGE / "pagos",
]

CARPETAS_SALIDAS = [
    RAIZ / "salidas" / "app" / "uploads",
    RAIZ / "salidas" / "app" / "respuestas",
    RAIZ / "salidas" / "app" / "texto_extraido",
    RAIZ / "salidas" / "app" / "imagenes_preprocesadas",
    RAIZ / "salidas" / "json",
    RAIZ / "salidas" / "texto_extraido",
    RAIZ / "salidas" / "imagenes_preprocesadas",
]

ARCHIVOS_SALIDAS = [
    RAIZ / "salidas" / "resultados.csv",
    RAIZ / "salidas" / "errores.csv",
    RAIZ / "salidas" / "reporte.html",
]

# Tablas de catalogo/auditoria que tambien se limpian para dejar todo en cero
TABLAS_EXCLUIDAS: set[str] = {"sqlite_sequence"}


def _borrar(path: Path, bloqueados: list[str]) -> int:
    try:
        if path.is_dir():
            total = sum(1 for f in path.rglob("*") if f.is_file())
            shutil.rmtree(path)
            return total
        path.unlink()
        return 1
    except (PermissionError, OSError):
        bloqueados.append(str(path))
        return 0


def vaciar_carpeta(carpeta: Path, bloqueados: list[str]) -> int:
    if not carpeta.exists():
        return 0
    return sum(_borrar(item, bloqueados) for item in list(carpeta.iterdir()))


def carpetas_documentos() -> list[Path]:
    """storage/<anio>/ generadas al guardar documentos."""
    if not STORAGE.exists():
        return []
    return [d for d in STORAGE.iterdir() if d.is_dir() and d.name.isdigit()]


def vaciar_base_datos() -> tuple[int, int]:
    """Borra todas las filas de todas las tablas. Devuelve (tablas, filas)."""
    if not DB_PATH.exists():
        return 0, 0

    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        tablas = [
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
            if row[0] not in TABLAS_EXCLUIDAS and not row[0].startswith("sqlite_")
        ]
        filas = 0
        for tabla in tablas:
            filas += conn.execute(f'SELECT COUNT(*) FROM "{tabla}"').fetchone()[0]
            conn.execute(f'DELETE FROM "{tabla}"')
        if conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'"
        ).fetchone():
            conn.execute("DELETE FROM sqlite_sequence")
        conn.commit()
        return len(tablas), filas
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Limpia todos los datos del sistema.")
    parser.add_argument("--si", action="store_true", help="No pedir confirmacion")
    parser.add_argument(
        "--conservar-salidas",
        action="store_true",
        help="No borrar la carpeta salidas/ (reportes y logs locales)",
    )
    args = parser.parse_args()

    if not args.si:
        print("Se borraran: facturas, Excel de Autobits, cruces, pagos y comprobantes.")
        if input("Escriba SI para continuar: ").strip().upper() != "SI":
            print("Cancelado.")
            return 1

    # La base debe existir con el esquema actual antes de vaciarla
    from infrastructure.persistence.database import init_db

    init_db()

    bloqueados: list[str] = []
    archivos = 0

    for carpeta in CARPETAS_DATOS:
        archivos += vaciar_carpeta(carpeta, bloqueados)
        carpeta.mkdir(parents=True, exist_ok=True)

    for carpeta in carpetas_documentos():
        archivos += _borrar(carpeta, bloqueados)

    if not args.conservar_salidas:
        for carpeta in CARPETAS_SALIDAS:
            archivos += vaciar_carpeta(carpeta, bloqueados)
            carpeta.mkdir(parents=True, exist_ok=True)
        for archivo in ARCHIVOS_SALIDAS:
            if archivo.exists():
                archivos += _borrar(archivo, bloqueados)

    tablas, filas = vaciar_base_datos()

    print(f"Base de datos: {filas} fila(s) borradas en {tablas} tabla(s).")
    print(f"Archivos eliminados: {archivos}")
    if bloqueados:
        print(f"En uso, no se pudieron borrar ({len(bloqueados)}):")
        for path in bloqueados[:10]:
            print(f"  - {path}")
    print("Sistema en cero. Suba el Excel de Autobits para empezar la semana.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
