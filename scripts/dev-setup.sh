#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# SAP Spektra — Local Development Setup
# Prerequisitos: Node >=20, Docker, npm
# ══════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> [1/6] Starting Docker services (Postgres 16 + Redis 7)..."
docker compose up -d

echo "==> [2/6] Waiting for Postgres to be ready..."
until docker compose exec -T postgres pg_isready -U spektra -d spektra_dev > /dev/null 2>&1; do
  sleep 1
done
echo "    Postgres ready on port 5433"

echo "==> [3/6] Setting up API .env (if missing)..."
if [ ! -f apps/api/.env ]; then
  cp apps/api/.env.example apps/api/.env
  echo "    Created apps/api/.env from .env.example"
else
  echo "    apps/api/.env already exists, skipping"
fi

echo "==> [4/6] Installing dependencies..."
(cd apps/api && npm install)
(cd frontend && npm install)

echo "==> [5/6] Running Prisma migrations + generate..."
(cd apps/api && npx prisma generate && npx prisma migrate dev --name init 2>/dev/null || npx prisma migrate deploy)

echo "==> [6/6] Seeding database..."
(cd apps/api && npm run prisma:seed 2>/dev/null || echo "    Seed skipped (may already exist)")

echo ""
echo "Setup complete! Start the dev servers:"
echo "  Terminal 1:  cd apps/api && npm run dev"
echo "  Terminal 2:  cd frontend && npm run dev"
echo ""
echo "  API:      http://localhost:3001/api"
echo "  Frontend: http://localhost:5173"
echo "  Postgres: localhost:5433 (spektra/spektra_dev)"
echo "  Redis:    localhost:6379"
