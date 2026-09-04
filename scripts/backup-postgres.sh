#!/usr/bin/env bash
# Backup PostgreSQL (SIG) vía pg_dump dentro del contenedor db.
# No modifica ni elimina datos de origen.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
set -a
source .env
set +a

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/postgres-sig-${STAMP}.sql.gz"

echo "==> Dump ${POSTGRES_DB} → ${OUT_FILE}"
docker compose exec -T db \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-acl \
  | gzip -c > "$OUT_FILE"

ls -lh "$OUT_FILE"
echo "Backup PostgreSQL OK."
