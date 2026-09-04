#!/usr/bin/env bash
# Actualiza código e imágenes sin borrar volúmenes/datos.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: falta .env"
  exit 1
fi

if [[ -d .git ]]; then
  echo "==> git pull..."
  git pull --ff-only || {
    echo "AVISO: git pull falló; continúa con el árbol actual."
  }
else
  echo "==> Sin .git — se reconstruye el árbol actual (ZIP/copia)."
fi

echo "==> Build..."
docker compose build

echo "==> Recrear contenedores (volúmenes intactos)..."
docker compose up -d --remove-orphans

echo "==> Estado:"
docker compose ps

echo "Update OK. Volúmenes PostgreSQL y Contabilidad NO se tocaron."
