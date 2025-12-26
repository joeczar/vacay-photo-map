#!/bin/bash
# Cleanup dev server processes on session end
# This prevents orphaned background processes

# Kill pnpm dev servers (kills child processes too)
pkill -f "pnpm dev" 2>/dev/null || true
pkill -f "pnpm dev:api" 2>/dev/null || true

# Stop docker compose dev services (optional - comment out if you want postgres to persist)
# docker compose -p vacay-dev down 2>/dev/null || true

echo "Dev servers cleaned up"
