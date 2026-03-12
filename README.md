# SAP Spektra

Mission Control for SAP Operations — monitoring, runbook automation, and intelligent remediation for SAP landscapes.

## Architecture

| Component | Path | Stack | Port |
|-----------|------|-------|------|
| **Backend API** | `apps/api/` | NestJS 11, Prisma 6, PostgreSQL 16 | 3001 |
| **Frontend** | `frontend/` | React 19, Vite 7, Tailwind CSS 4 | 5173 |
| **Database** | `docker-compose.yml` | PostgreSQL 16 + Redis 7 (Docker) | 5433 / 6379 |
| **Agent** | `agent/` | Python (on-premise SAP host collector) | — |

See [ARCHITECTURE.md](ARCHITECTURE.md) for full architecture details, legacy paths, and data flow.

## Quick Start

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Setup backend
cd apps/api
cp .env.example .env          # adjust if needed
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed

# 3. Start backend (port 3001)
npm run dev

# 4. Start frontend (new terminal, port 5173)
cd frontend
npm install
npm run dev
```

Or use the setup script: `./scripts/dev-setup.sh` then `./scripts/dev-start.sh`

Open: http://localhost:5173

## Login Credentials (seeded)

| Email | Role | Password |
|-------|------|----------|
| admin@acme-corp.com | admin | admin123 |
| escalation@acme-corp.com | escalation | admin123 |
| operator@acme-corp.com | operator | admin123 |
| viewer@acme-corp.com | viewer | admin123 |

## SAP Systems (seeded)

12 SAP systems covering all supported database engines and operating systems:

| SID | Product | Database | OS | Environment |
|-----|---------|----------|----|-------------|
| EP1 | S/4HANA 2023 | SAP HANA 2.0 | SLES 15 SP5 | PRD |
| EQ1 | S/4HANA 2023 | SAP HANA 2.0 | SLES 15 SP5 | QAS |
| ED1 | S/4HANA 2023 | SAP HANA 2.0 | SLES 15 SP5 | DEV |
| BW1 | BW/4HANA | SAP HANA 2.0 | SLES 15 SP4 | PRD |
| SM1 | SolMan 7.2 | SAP HANA 2.0 | SLES 15 SP5 | PRD |
| PI1 | SAP PO 7.5 | Oracle 19c | RHEL 8.9 | PRD |
| RS1 | S/4HANA Cloud | SAP HANA Cloud | RISE Managed | PRD |
| GR1 | SAP GRC 12.0 | Microsoft SQL Server | Windows Server 2022 | PRD |
| CR1 | SAP CRM 7.0 | Oracle 19c | RHEL 8.8 | PRD |
| EW1 | SAP EWM 9.5 | IBM DB2 11.5 | AIX 7.3 | PRD |
| MX1 | SAP ECC 6.0 | SAP MaxDB 7.9 | SLES 15 SP3 | PRD |
| SO1 | SAP ECC 6.0 | Oracle 19c | Solaris 11.4 | PRD |

Database engines: HANA 2.0, Oracle, MSSQL, DB2, ASE, MaxDB, HANA Cloud.
Operating systems: SLES, RHEL, Windows, AIX, Solaris.

## Runbooks

123 runbooks with compatibility validation — execution is blocked if the system doesn't meet prerequisites (database type, SAP stack, OS, HA config).

Categories: HANA, Oracle, MSSQL, DB2, ASE, MaxDB, Linux, Windows, AIX, Solaris, ABAP, BW, PO.

## Key Features

- **Multi-tenant isolation** — every query scoped by `organizationId`
- **Role-based access** — admin > escalation > operator > viewer
- **Runbook execution** — dry-run validation + step-by-step execution with compatibility checks
- **RISE restricted** — systems with `RISE_RESTRICTED` profile cannot execute runbooks or expose OS metrics
- **Monitoring** — health snapshots, host metrics, breaches, dependency tracking
- **Operations** — jobs, transports, certificates, approval workflows
- **Analytics** — system trends, runbook analytics, overview dashboards

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Active runtime, legacy paths, data flow |
| [docs/backend-architecture.md](docs/backend-architecture.md) | NestJS module structure, RBAC, API conventions |
| [docs/domain-model.md](docs/domain-model.md) | Prisma schema and entity relationships |
| [docs/local-runtime.md](docs/local-runtime.md) | Detailed local development guide |
| [docs/api-reference.md](docs/api-reference.md) | REST API reference |

## Project Structure

```
apps/api/       Active backend (NestJS + Prisma + PostgreSQL)
frontend/       Active frontend (React 19 + Vite 7 + Tailwind 4)
agent/          On-premise SAP host collector (Python)
infra/          Infrastructure-as-code (AWS Terraform)
scripts/        Dev setup, CI, deployment scripts
docs/           Project documentation
lambda/         [LEGACY] Original serverless functions → replaced by apps/api/
cfn/            [LEGACY] CloudFormation templates → replaced by infra/
setup/          [DEPRECATED] Mock data server → replaced by apps/api/ + prisma:seed
```

## Scripts

```bash
./scripts/dev-setup.sh    # Full local setup (Docker + install + migrate + seed)
./scripts/dev-start.sh    # Start API + Frontend concurrently
```

---

*SAP Spektra — Mission Control for SAP Operations*
