#!/bin/sh
set -e
echo "Running migrations..."
bun run scripts/migrate.ts
echo "Starting server..."
exec bun run src/index.ts
