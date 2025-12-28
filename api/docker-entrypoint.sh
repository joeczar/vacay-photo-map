#!/bin/sh

log() {
  echo "[$(date -Iseconds)] [entrypoint] $1"
}

log "Running migrations..."
if ! bun scripts/migrate.ts; then
  log "ERROR: Migration failed! Check logs above for details."
  exit 1
fi
log "Migrations complete"

log "Starting server..."
exec bun src/index.ts
