#!/bin/sh
# =============================================================================
# pgdog-entrypoint.sh
#
# Genera /runtime/users.toml desde users.toml.tmpl usando las env vars
# inyectadas por Dokploy. Requiere: sh, sed (disponibles en debian-slim/alpine)
# =============================================================================
set -e

TEMPLATE="/config/users.toml.tmpl"
OUTPUT="/runtime/users.toml"

for var in PGDOG_USERNAME PGDOG_PASSWORD DB_USERNAME DB_PASSWORD DB_DATABASE; do
  eval "val=\$$var"
  if [ -z "$val" ]; then
    echo "[pgdog-entrypoint] ERROR: env var '$var' no definida en Dokploy."
    exit 1
  fi
done

echo "[pgdog-entrypoint] Generando $OUTPUT..."

sed \
  -e "s|\${PGDOG_USERNAME}|${PGDOG_USERNAME}|g" \
  -e "s|\${PGDOG_PASSWORD}|${PGDOG_PASSWORD}|g" \
  -e "s|\${DB_USERNAME}|${DB_USERNAME}|g" \
  -e "s|\${DB_PASSWORD}|${DB_PASSWORD}|g" \
  -e "s|\${DB_DATABASE}|${DB_DATABASE}|g" \
  -e "s|\${PGDOG_MIGRATIONS_PASSWORD:-\${PGDOG_PASSWORD}}|${PGDOG_MIGRATIONS_PASSWORD:-${PGDOG_PASSWORD}}|g" \
  "$TEMPLATE" > "$OUTPUT"

echo "[pgdog-entrypoint] users.toml generado OK."
exec pgdog
