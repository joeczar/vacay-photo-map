#!/bin/bash
# Cleanup dev server processes on session end
# This prevents orphaned background processes

# Kill pnpm/vite dev servers
pkill -f "pnpm dev" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "bun.*dev:api" 2>/dev/null || true

# Stop docker compose dev services (optional - comment out if you want postgres to persist)
# docker compose -p vacay-dev down 2>/dev/null || true

echo "Dev servers cleaned up"
