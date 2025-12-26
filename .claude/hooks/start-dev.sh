#!/bin/bash
# Start dev servers on session start (optional)
# Uncomment sections as needed

cd "$CLAUDE_PROJECT_DIR" || exit 1

# Check if postgres is running
if ! docker compose -p vacay-dev ps postgres 2>/dev/null | grep -q "running"; then
  echo "Starting postgres..."
  docker compose -p vacay-dev up -d postgres

  # Wait for postgres to be ready (up to 30 seconds)
  echo "Waiting for postgres to be ready..."
  for i in {1..30}; do
    if docker compose -p vacay-dev exec -T postgres pg_isready -U vacay >/dev/null 2>&1; then
      echo "Postgres is ready"
      break
    fi
    sleep 1
  done
fi

# Optionally auto-start dev servers (uncomment if desired)
# if ! pgrep -f "vite" > /dev/null; then
#   echo "Starting frontend dev server..."
#   pnpm dev &
# fi

# if ! pgrep -f "bun run --hot src/index.ts" > /dev/null; then
#   echo "Starting API dev server..."
#   pnpm dev:api &
# fi

echo "Dev environment ready"
