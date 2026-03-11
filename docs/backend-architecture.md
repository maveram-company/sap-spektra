# SAP Spektra — Backend Architecture

## Overview

SAP Spektra's backend is a **NestJS modular monolith** with TypeScript strict mode, Prisma ORM, and PostgreSQL. It supports two runtime modes sharing identical business logic:

| Mode | Use Case | Database | Auth | Queue |
|------|----------|----------|------|-------|
| `LOCAL_SIMULATED` | Development | Docker PostgreSQL | Local JWT | In-memory |
| `AWS_REAL` | Production | RDS PostgreSQL | Cognito + JWT | SQS |

## Tech Stack

- **Runtime**: Node.js 22, NestJS 11
- **Language**: TypeScript 5.8 (strict)
- **ORM**: Prisma 6 with PostgreSQL 16
- **Auth**: Passport JWT + bcrypt (local), Cognito-ready
- **Docs**: Swagger/OpenAPI at `/api/docs`
- **Validation**: class-validator + class-transformer
- **Cache**: Redis 7 (ElastiCache in AWS)

## Module Architecture

```
apps/api/src/
├── main.ts                    # Bootstrap, Swagger, CORS, pipes
├── app.module.ts              # Root module (19 feature modules)
├── config/                    # Typed configuration
├── common/
│   ├── guards/                # JwtAuth, Roles, Tenant
│   ├── filters/               # Global exception filter
│   ├── interceptors/          # Logging interceptor
│   ├── decorators/            # @CurrentUser, @Roles, @TenantId
│   └── dto/                   # Pagination DTO
├── domain/
│   └── enums/                 # All domain enums (UserRole, SapStackType, etc.)
├── infrastructure/
│   └── prisma/                # PrismaService, PrismaModule, seed.ts
└── modules/
    ├── auth/                  # Login, register, JWT strategy
    ├── health/                # Health check endpoint
    ├── dashboard/             # Aggregated dashboard data
    ├── users/                 # User CRUD within tenant
    ├── systems/               # SAP system management
    ├── tenants/               # Organization/tenant management
    ├── alerts/                # Alert CRUD + acknowledge/resolve
    ├── events/                # Event log with filters
    ├── approvals/             # Approval workflow (request/approve/reject)
    ├── runbooks/              # Runbook management + execution
    ├── operations/            # Operations, jobs, transports, certificates
    ├── audit/                 # Audit log (admin-only)
    ├── connectors/            # System connector management
    ├── ha/                    # HA/DR configuration + failover
    ├── metrics/               # Host metrics, health snapshots, breaches
    ├── analytics/             # Analytics aggregations + trends
    ├── chat/                  # AI assistant (simulated / Bedrock-ready)
    ├── plans/                 # Plan/pricing management
    └── settings/              # Org settings + API key management
```

## Multi-Tenant Isolation

Every authenticated request carries `organizationId` in the JWT payload. The `TenantGuard` enforces this, and every service method filters by `organizationId`:

```typescript
// Every query is tenant-scoped
async findAll(organizationId: string) {
  return this.prisma.system.findMany({
    where: { organizationId },
  });
}
```

## RBAC (Role-Based Access Control)

Roles follow a hierarchy: `admin(40) > escalation(30) > operator(20) > viewer(10)`.

The `RolesGuard` compares the user's role level against the minimum required:

```typescript
@Roles('operator')  // operator, escalation, admin can access
@Get('sensitive-data')
getData() { ... }
```

## API Conventions

- All routes prefixed with `/api/`
- Authentication: `Authorization: Bearer <jwt>`
- Responses: JSON with consistent error format
- Pagination: `?page=1&limit=20`
- Filtering: Query parameters per endpoint
- Swagger docs: `GET /api/docs`
