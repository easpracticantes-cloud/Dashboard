#!/usr/bin/env bash
# Backup Contabilidad: SQLite contable.db + storage/
# No modifica ni elimina datos de origen.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/contabilidad-${STAMP}.tar.gz"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Copiando volúmenes desde contenedor..."
docker compose exec -T contabilidad sh -c 'tar -C /app -cf - data storage' > "$TMP/contabilidad-raw.tar"
gzip -c "$TMP/contabilidad-raw.tar" > "$OUT_FILE"

ls -lh "$OUT_FILE"
echo "Backup Contabilidad OK (data/contable.db + storage/)."
