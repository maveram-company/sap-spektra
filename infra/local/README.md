# Local Development Setup

## Prerequisites
- Node.js 22+
- Docker Desktop (for PostgreSQL + Redis)

## Quick Start

```bash
# 1. Start databases
docker compose up -d

# 2. Install dependencies
cd apps/api && npm install

# 3. Run migrations
npx prisma migrate dev --name init

# 4. Seed the database
npm run prisma:seed

# 5. Start the API (watch mode)
npm run dev
# → http://localhost:3001/api/docs

# 6. Start the frontend (in another terminal)
cd frontend && npm run dev
# → http://localhost:5173
```

## Credentials (seed data)
| Email | Password | Role |
|-------|----------|------|
| admin@acme-corp.com | admin123 | admin |
| escalation@acme-corp.com | admin123 | escalation |
| operator@acme-corp.com | admin123 | operator |
| viewer@acme-corp.com | admin123 | viewer |

## Reset Database
```bash
cd apps/api
npm run prisma:reset   # Drops and recreates
npm run prisma:seed     # Re-seeds demo data
```
