#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# SAP Spektra — Start all dev services
# Starts Docker + API + Frontend in foreground
# ══════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Starting Docker services..."
docker compose up -d

echo "==> Waiting for Postgres..."
until docker compose exec -T postgres pg_isready -U spektra -d spektra_dev > /dev/null 2>&1; do
  sleep 1
done

echo "==> Starting API (port 3001) and Frontend (port 5173)..."
echo "    Press Ctrl+C to stop both"
echo ""

# Run API and Frontend concurrently; kill both on Ctrl+C
trap 'kill 0; exit 0' SIGINT SIGTERM
(cd apps/api && npm run dev) &
(cd frontend && npm run dev) &
wait
