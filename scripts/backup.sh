#!/usr/bin/env bash
# Sauvegarde MySQL compressée. Lit les identifiants dans le .env à la racine.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; source "$ROOT/.env"; set +a
mkdir -p "$ROOT/backups"
OUT="$ROOT/backups/boutique-$(date +%Y%m%d-%H%M%S).sql.gz"
MYSQL_PWD="$DB_PASSWORD" mysqldump -h "${DB_HOST:-127.0.0.1}" -P "${DB_PORT:-3306}" -u "$DB_USER" \
  --single-transaction --routines --no-tablespaces "$DB_NAME" | gzip > "$OUT"
echo "Sauvegarde créée : $OUT"
