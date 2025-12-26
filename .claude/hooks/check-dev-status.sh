#!/bin/bash
# Check status of dev servers
# Can be used as a diagnostic tool

echo "=== Dev Server Status ==="

# Check postgres
if docker compose -p vacay-dev ps postgres 2>/dev/null | grep -q "running"; then
  echo "✓ Postgres: running"
else
  echo "✗ Postgres: not running"
fi

# Check frontend
if pgrep -f "vite" > /dev/null; then
  echo "✓ Frontend (Vite): running on localhost:5173"
else
  echo "✗ Frontend: not running"
fi

# Check API
if pgrep -f "bun run --hot src/index.ts" > /dev/null; then
  echo "✓ API: running on localhost:4000"
else
  echo "✗ API: not running"
fi

# List any background Claude tasks
if command -v claude &> /dev/null; then
  echo ""
  echo "=== Background Tasks ==="
  echo "Use /tasks in Claude Code to view"
fi
