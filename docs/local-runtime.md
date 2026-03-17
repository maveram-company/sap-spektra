# SAP Spektra — Local Development Guide

## Prerequisites

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| **Node.js** | 20.19.0+ | Backend and frontend runtime |
| **npm** | 10+ | Package management |
| **PostgreSQL** | 16 | Primary database |
| **Redis** | 7 | Application cache |
| **Docker** (optional) | 24+ | Container runtime for Postgres + Redis |
| **Docker Compose** (optional) | 2+ | Multi-container orchestration |

## Setup with Docker Compose (Recommended)

Docker Compose provides PostgreSQL 16 and Redis 7 in containers. This is the simplest setup path.

### 1. Start Infrastructure

```bash
# From the project root
docker compose up -d
```

This starts:
- **PostgreSQL 16** on port `5433` (mapped from container port 5432)
- **Redis 7** on port `6379`

Verify they are healthy:

```bash
docker compose ps
```

Both services should show `healthy` status.

### 2. Setup Backend

```bash
cd apps/api

# Copy environment file
cp .env.example .env

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init

# Seed demo data (12 SAP systems, 4 users, 123 runbooks)
npm run prisma:seed
```

### 3. Start Backend

```bash
cd apps/api
npm run dev
```

The API starts on `http://localhost:3001`. Swagger documentation is available at `http://localhost:3001/api/docs`.

### 4. Start Frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend starts on `http://localhost:5173`.

### 5. Open the Application

Navigate to `http://localhost:5173` and log in with any of the seeded credentials.

## Setup without Docker (Homebrew)

If you prefer running PostgreSQL and Redis natively on macOS.

### Install PostgreSQL 16

```bash
brew install postgresql@16
brew services start postgresql@16
```

Create the database and user:

```bash
createuser -s spektra
createdb -O spektra spektra_dev
psql -d spektra_dev -c "ALTER USER spektra WITH PASSWORD 'spektra_dev';"
```

### Install Redis 7

```bash
brew install redis
brew services start redis
```

Verify Redis is running:

```bash
redis-cli ping
# Should respond: PONG
```

### Update DATABASE_URL

When running PostgreSQL natively (without Docker), the default port is **5432** instead of Docker's **5433**.

Edit `apps/api/.env`:

```bash
# Native PostgreSQL (port 5432)
DATABASE_URL=postgresql://spektra:spektra_dev@localhost:5432/spektra_dev?schema=public

# Docker PostgreSQL (port 5433) — this is the .env.example default
# DATABASE_URL=postgresql://spektra:spektra_dev@localhost:5433/spektra_dev?schema=public
```

Then follow steps 2-5 from the Docker Compose setup above.

## DATABASE_URL Configuration

| Setup | Port | DATABASE_URL |
|-------|------|-------------|
| Docker Compose | 5433 | `postgresql://spektra:spektra_dev@localhost:5433/spektra_dev?schema=public` |
| Native Postgres | 5432 | `postgresql://spektra:spektra_dev@localhost:5432/spektra_dev?schema=public` |
| Docker internal | 5432 | `postgresql://spektra:spektra_dev@postgres:5432/spektra_dev` (used by the `api` container) |

## Quick Setup (Script)

A convenience script handles the entire setup:

```bash
# Full setup: Docker + install + migrate + seed
./scripts/dev-setup.sh

# Start API + Frontend concurrently
./scripts/dev-start.sh
```

## Step-by-Step Summary

```
1. docker compose up -d          # Start Postgres + Redis
2. cd apps/api && cp .env.example .env
3. npm install                   # Install backend dependencies
4. npx prisma generate           # Generate Prisma client
5. npx prisma migrate dev        # Apply migrations
6. npm run prisma:seed           # Seed demo data
7. npm run dev                   # Start API (port 3001)
8. cd frontend && npm install    # Install frontend dependencies
9. npm run dev                   # Start frontend (port 5173)
```

## Login Credentials (Seeded)

All users belong to the "ACME Corp" organization. Password for all: `admin123`

| Email | Role | Level | Permissions |
|-------|------|-------|-------------|
| `admin@acme-corp.com` | admin | 40 | Full access: user management, system registration, failover, settings, audit |
| `escalation@acme-corp.com` | escalation | 30 | Approve/reject requests, all operator permissions |
| `operator@acme-corp.com` | operator | 20 | Execute runbooks, acknowledge alerts, create operations, ingest metrics |
| `viewer@acme-corp.com` | viewer | 10 | Read-only access to all resources |

## Available npm Scripts

### Backend (`apps/api/`)

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `nest start --watch` | Start in watch mode (hot reload) |
| `build` | `nest build` | Compile TypeScript |
| `start` | `node dist/main` | Start compiled app |
| `start:debug` | `nest start --debug --watch` | Start with debugger |
| `start:prod` | `node dist/main` | Production start |
| `lint` | `eslint "{src,test}/**/*.ts" --fix` | Lint and auto-fix |
| `format` | `prettier --write "src/**/*.ts"` | Format source files |
| `typecheck` | `tsc --noEmit` | Type-check without emitting |
| `test` | `jest` | Run unit tests |
| `test:watch` | `jest --watch` | Run tests in watch mode |
| `test:cov` | `jest --coverage` | Run tests with coverage report |
| `test:e2e` | `jest --config ./test/jest-e2e.json` | Run end-to-end tests |
| `prisma:generate` | `prisma generate` | Regenerate Prisma client |
| `prisma:migrate` | `prisma migrate dev` | Create/apply migrations |
| `prisma:migrate:deploy` | `prisma migrate deploy` | Deploy migrations (prod) |
| `prisma:seed` | `ts-node src/infrastructure/prisma/seed.ts` | Seed database with demo data |
| `prisma:studio` | `prisma studio` | Open Prisma Studio (GUI) |
| `prisma:reset` | `prisma migrate reset --force` | Reset database (drop + recreate + seed) |

### Frontend (`frontend/`)

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `vite` | Start dev server with HMR |
| `build` | `vite build` | Production build |
| `preview` | `vite preview` | Preview production build |
| `lint` | `eslint .` | Lint source files |

## Environment Variables (.env Reference)

Create `apps/api/.env` from `.env.example`. Complete reference:

```bash
# ══════════════════════════════════════════════════════════
# SAP Spektra API — Environment Configuration
# ══════════════════════════════════════════════════════════

# Runtime mode: LOCAL_SIMULATED | AWS_REAL
RUNTIME_MODE=LOCAL_SIMULATED

# Server
PORT=3001
NODE_ENV=development

# Database (PostgreSQL)
# Docker:  port 5433
# Native:  port 5432
DATABASE_URL=postgresql://spektra:spektra_dev@localhost:5433/spektra_dev?schema=public

# Redis
REDIS_URL=redis://localhost:6379

# Cache TTL (milliseconds)
CACHE_TTL=30000

# JWT (Local auth — change in production!)
JWT_SECRET=spektra-local-dev-secret-change-in-production
JWT_EXPIRATION=24h
JWT_REFRESH_EXPIRATION=7d

# AWS Cognito (AWS_REAL mode only)
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=

# AWS Services (AWS_REAL mode only)
AWS_REGION=us-east-1
S3_BUCKET=
SQS_QUEUE_URL=
EVENTBRIDGE_BUS=

# Logging
LOG_LEVEL=debug

# CORS (comma-separated origins)
CORS_ORIGIN=http://localhost:5173,http://localhost:5174

# Seed scenario
SEED_SCENARIO=mixed-landscape-demo

# Demo API key
DEMO_API_KEY=

# Spektra Agent
SPEKTRA_AGENT_URL=http://localhost:9110

# Operation Timeouts
OPERATION_TIMEOUT_MS=120000
OPERATION_TIMEOUT_S=120
```

## Troubleshooting

### PostgreSQL PID Lockfile Error

**Symptom:** PostgreSQL fails to start with "lock file postmaster.pid already exists"

```bash
# Remove stale lock file (native install)
rm /opt/homebrew/var/postgresql@16/postmaster.pid
brew services restart postgresql@16

# Docker: just restart the container
docker compose restart postgres
```

### Port Conflicts

**Symptom:** "EADDRINUSE" or "port already in use"

```bash
# Find what's using port 3001 (API)
lsof -ti:3001 | xargs kill -9

# Find what's using port 5173 (Frontend)
lsof -ti:5173 | xargs kill -9

# Find what's using port 5433 (Docker Postgres)
lsof -ti:5433 | xargs kill -9

# Find what's using port 6379 (Redis)
lsof -ti:6379 | xargs kill -9
```

### Prisma Client Out of Sync

**Symptom:** "PrismaClientInitializationError" or type errors after schema changes

```bash
cd apps/api
npx prisma generate
```

### Prisma Migration Errors

**Symptom:** Migration fails or database schema is out of sync

```bash
# Reset database (WARNING: drops all data)
cd apps/api
npm run prisma:reset

# Or manually:
npx prisma migrate reset --force
npx prisma migrate dev --name init
npm run prisma:seed
```

### Prisma Permission Issues

**Symptom:** "permission denied" when running prisma commands

```bash
# Fix node_modules permissions
rm -rf node_modules
npm install

# If using a global Prisma CLI
npx prisma generate  # Use npx to ensure local version
```

### Redis Connection Refused

**Symptom:** "ECONNREFUSED 127.0.0.1:6379"

```bash
# Docker
docker compose up -d redis

# Native
brew services start redis
redis-cli ping  # Should return PONG
```

### Docker Compose Volumes Stale

**Symptom:** Database has old data or migrations fail

```bash
# Remove volumes and recreate
docker compose down -v
docker compose up -d
```

### Frontend Proxy Issues

**Symptom:** API calls from frontend return 404 or CORS errors

Ensure the API is running on port 3001 and `CORS_ORIGIN` includes `http://localhost:5173`.

## Running Tests

### Backend Tests (Jest)

```bash
cd apps/api

# Run all unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage report
npm run test:cov

# Run end-to-end tests
npm run test:e2e
```

### Frontend Tests (Vitest)

```bash
cd frontend

# Run all tests
npm test

# Run in watch mode
npm run test:watch
```

### End-to-End Tests (Playwright)

```bash
# Ensure both API and frontend are running first
cd frontend

# Install Playwright browsers (first time)
npx playwright install

# Run E2E tests
npx playwright test

# Run with UI
npx playwright test --ui
```

### Type Checking

```bash
# Backend
cd apps/api && npm run typecheck

# Frontend
cd frontend && npx tsc --noEmit
```

### Linting

```bash
# Backend
cd apps/api && npm run lint

# Frontend
cd frontend && npm run lint
```
