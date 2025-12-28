#!/bin/sh
set -e

log() {
  echo "[$(date -Iseconds)] [entrypoint] $1"
}

log "Running migrations..."
bun scripts/migrate.ts
log "Migrations complete"

log "Starting server..."
exec bun src/index.ts
