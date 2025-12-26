#!/bin/bash
# Start dev servers on session start (optional)
# Uncomment sections as needed

cd "$CLAUDE_PROJECT_DIR" || exit 1

# Check if postgres is running
if ! docker compose -p vacay-dev ps postgres 2>/dev/null | grep -q "running"; then
  echo "Starting postgres..."
  docker compose -p vacay-dev up -d postgres
  sleep 2
fi

# Optionally auto-start dev servers (uncomment if desired)
# if ! pgrep -f "vite" > /dev/null; then
#   echo "Starting frontend dev server..."
#   pnpm dev &
# fi

# if ! pgrep -f "bun.*dev:api" > /dev/null; then
#   echo "Starting API dev server..."
#   pnpm dev:api &
# fi

echo "Dev environment ready"
