#!/usr/bin/env bash
# Despliegue inicial / (re)arranque seguro en Oracle Cloud.
# NO elimina volúmenes ni datos.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: falta .env — copia .env.example y completa secretos/dominio."
  exit 1
fi

echo "==> Validando compose..."
docker compose config -q

echo "==> Build imágenes..."
docker compose build

echo "==> Up (sin tocar volúmenes)..."
docker compose up -d

echo "==> Estado:"
docker compose ps

echo ""
echo "Listo. Verifica:"
echo "  curl -I http://127.0.0.1/"
echo "  curl -s http://127.0.0.1/api/v1/actuator/health || curl -s http://127.0.0.1/actuator/health"
echo "  docker compose exec backend wget -qO- http://contabilidad:8787/api/health || true"
echo ""
echo "Nunca uses: docker compose down -v  (borra datos)"
