# SAP Spektra — Local Runtime Guide

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   NestJS API │────▶│  PostgreSQL  │
│  (Vite/React)│     │  port 3001   │     │  port 5432   │
│  port 5173   │     │              │────▶│              │
└──────────────┘     │  /api/docs   │     └──────────────┘
                     │              │     ┌──────────────┐
                     │              │────▶│    Redis      │
                     └──────────────┘     │  port 6379   │
                                          └──────────────┘
```

## Prerequisites

1. **Node.js 22+** and npm
2. **Docker Desktop** (for PostgreSQL and Redis)

## Setup Steps

### 1. Start Infrastructure
```bash
# From project root
docker compose up -d

# Verify containers running
docker ps
# Should see: spektra-postgres, spektra-redis
```

### 2. Backend Setup
```bash
cd apps/api

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Create initial migration
npx prisma migrate dev --name init

# Seed with demo data
npm run prisma:seed

# Start API in watch mode
npm run dev
```

Verify: `curl http://localhost:3001/api/health`

### 3. Frontend Setup
```bash
cd frontend

# Install (if not done)
npm install

# Start dev server
npm run dev
```

Open: `http://localhost:5173`

### 4. Login
Use any of the seeded accounts:
- **admin@acme-corp.com** / admin123 (full access)
- **operator@acme-corp.com** / admin123 (operations)
- **viewer@acme-corp.com** / admin123 (read-only)

## Demo Mode vs API Mode

The frontend has a `demoMode` flag in `frontend/src/config.js`:

```javascript
features: {
  demoMode: true,   // Uses mock data (no backend needed)
  // demoMode: false, // Uses real API calls to NestJS backend
}
```

Set `demoMode: false` to connect to the real backend.

## Useful Commands

```bash
# Prisma Studio (visual DB editor)
cd apps/api && npx prisma studio

# Reset database (drop + recreate + seed)
npm run prisma:reset && npm run prisma:seed

# Type check
npm run typecheck

# View Swagger docs
open http://localhost:3001/api/docs
```

## Environment Variables

See `apps/api/.env.example` for all available options.

Key variables:
| Variable | Default | Description |
|----------|---------|-------------|
| `RUNTIME_MODE` | `LOCAL_SIMULATED` | Runtime mode |
| `PORT` | `3001` | API port |
| `DATABASE_URL` | `postgresql://spektra:spektra_dev@localhost:5432/spektra_dev` | PostgreSQL connection |
| `JWT_SECRET` | `spektra-local-dev-secret...` | JWT signing secret |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed origins |
