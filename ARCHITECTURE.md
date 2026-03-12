# SAP Spektra — Architecture Overview

## Active Runtime

| Component | Path | Stack | Port |
|-----------|------|-------|------|
| **Backend API** | `apps/api/` | NestJS 11, Prisma 6, PostgreSQL 16 | 3001 |
| **Frontend** | `frontend/` | React 19, Vite 7, Tailwind CSS 4, Recharts | 5173 |
| **Database** | `docker-compose.yml` | PostgreSQL 16 (Docker) | 5433 |
| **On-premise Agent** | `agent/` | Python, systemd | — |

## Active Support

| Path | Purpose |
|------|---------|
| `infra/` | Infrastructure-as-code (AWS Terraform/CDK) |
| `scripts/` | Dev setup, CI, deployment scripts |
| `docs/` | Project documentation |
| `packages/` | Shared types/contracts (monorepo packages) |

## Legacy / Deprecated (not deployed)

| Path | Was | Replaced by |
|------|-----|-------------|
| `lambda/` | 22 AWS Lambda functions (serverless API) | `apps/api/` (NestJS monolith) |
| `cfn/` | CloudFormation templates | `infra/` |
| `setup/` | Express mock-data server for frontend dev | `apps/api/` + `prisma:seed` |
| `dashboard/` | Empty placeholder for earlier UI | `frontend/` |
| `shared/` | UI schema renderer | Inlined in `frontend/` components |
| `tests/` | Integration tests for Lambda functions | `apps/api/src/**/*.spec.ts` |

Each deprecated directory contains a `DEPRECATED.md` explaining its status and what replaced it.

## Data Flow

```
Browser → frontend (React SPA, port 5173)
              ↓ HTTP/JSON
         apps/api (NestJS, port 3001)
              ↓ Prisma ORM
         PostgreSQL (Docker, port 5433)
```

## Key Concepts

- **Tenant isolation**: Every request carries `organizationId` in JWT; `TenantGuard` enforces it
- **Role hierarchy**: admin(40) > escalation(30) > operator(20) > viewer(10)
- **MonitoringCapabilityProfile**: Determines what metrics are available per system
  - `FULL_STACK_AGENT`: Full OS + SAP + DB metrics (on-premise agent installed)
  - `RISE_RESTRICTED`: SAP-managed infra — no OS metrics, application-level only
- **dataService.js**: Frontend transformation layer — adapts API responses to page expectations, generates synthetic values where real telemetry isn't connected yet
