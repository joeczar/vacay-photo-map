#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

COMPOSE="docker compose -p vacay-dev -f docker-compose.yml"

echo "Checking Postgres container status..."
$COMPOSE ps postgres

echo "Listing trips (slug, is_public)..."
$COMPOSE exec -T postgres psql -U vacay -d vacay -c "SELECT slug, is_public FROM trips;"

echo "Listing photos joined to trips (first 5)..."
$COMPOSE exec -T postgres psql -U vacay -d vacay -c "SELECT p.storage_key, t.slug FROM photos p JOIN trips t ON t.id = p.trip_id LIMIT 5;"
