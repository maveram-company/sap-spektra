# SAP Spektra — Claims vs Code Audit & Security Review

**Date:** 2026-03-17
**Scope:** Repository-wide claims verification and security review
**Methodology:** Static code analysis against documented claims in README.md, ARCHITECTURE.md, and docs/

---

## Phase 7 — Claims vs Code Verification

### 1. "AWS_REAL mode with Cognito" End-to-End Support

**Verdict: FALSE — Infrastructure exists, but no runtime integration code**

| Aspect | Claim | Reality |
|--------|-------|---------|
| Cognito auth | "AWS_REAL mode can integrate with AWS Cognito for production authentication" (ARCHITECTURE.md:120) | Config placeholders exist (`configuration.ts:64-68`) but **zero** `@aws-sdk/client-cognito` imports in any NestJS source file. Auth always uses local JWT via Passport (`jwt.strategy.ts`). |
| S3 storage | "S3 storage" (ARCHITECTURE.md:167) | Config key `aws.s3Bucket` is read but **no S3 client** is imported or used anywhere in `apps/api/src/`. |
| SQS queues | "SQS queues" (ARCHITECTURE.md:167) | Config key `aws.sqsQueueUrl` is read but **no SQS client** is imported or used anywhere in `apps/api/src/`. |
| EventBridge | "EventBridge events" (ARCHITECTURE.md:167) | Config key `aws.eventBridgeBus` is read but **no EventBridge client** is imported or used anywhere in `apps/api/src/`. |
| Terraform | Infrastructure defined in `infra/aws/main.tf` | Terraform templates exist and are valid (VPC, RDS, ElastiCache, Cognito, S3, SQS, EventBridge, ECS). This is a **foundation template** only. |

**Evidence:**
- `apps/api/src/config/configuration.ts:64-74` — config keys exist but are never consumed by any service
- `grep -r '@aws-sdk' apps/api/src/` returns zero results
- `infra/aws/main.tf:1-6` — self-described as "FOUNDATION template"
- The `RUNTIME_MODE` check in services (`ha.service.ts:157`, `runbook-execution-engine.service.ts:208`, `chat.service.ts:37`, `connectors.service.ts:69`) toggles between simulated and "agent via HTTP" — not AWS services

**Bottom line:** `AWS_REAL` mode would use the Spektra Agent via HTTP for command execution (which is a real integration path), but the Cognito/S3/SQS/EventBridge services described in ARCHITECTURE.md are **not implemented in application code**. The Terraform infra provisions them, but nothing in the NestJS app consumes them.

---

### 2. "97+ REST Endpoints"

**Verdict: FALSE — 78 endpoints exist**

| Controller | Endpoints |
|------------|-----------|
| ai | 2 |
| alerts | 4 |
| analytics | 3 |
| approvals | 5 |
| audit | 1 |
| auth | 3 |
| chat | 1 |
| connectors | 5 |
| dashboard | 1 |
| events | 1 |
| ha | 7 |
| health | 2 |
| landscape | 1 |
| licenses | 1 |
| metrics | 9 |
| operations | 6 |
| plans | 2 |
| runbooks | 5 |
| settings | 5 |
| systems | 6 |
| tenants | 3 |
| users | 5 |
| **Total** | **78** |

**Evidence:** `grep -cE '@(Get|Post|Put|Patch|Delete)\(' apps/api/src/modules/*/*.controller.ts`

The claim of "97+" in ARCHITECTURE.md:9 and ARCHITECTURE.md:38 is overstated by ~24%.

---

### 3. "123 Runbooks" Seeded

**Verdict: FALSE — 119 runbooks are seeded (18 base + 101 extra)**

**Evidence:**
- `apps/api/src/infrastructure/prisma/seed.ts:2037` — "18 base runbooks" logged
- `apps/api/src/infrastructure/prisma/seed.ts:4832-4835` — `totalRunbooks = 18 + extraRunbooks.length`
- Counted 101 entries in `extraRunbooks` array (each has `organizationId: org.id`)
- Total: 18 + 101 = **119 runbooks**, not 123

README.md:76 claims "123 runbooks with compatibility validation." The actual count is 119. The claim is close but overstated by 4.

---

### 4. Agent/Collector with RFC/BAPI

**Verdict: PARTIALLY TRUE — Real SAP integration via sapcontrol SOAP, not RFC/BAPI**

The agent at `agent/spektra_agent/` contains **real, functional collectors** (not stubs):

| Collector | Integration Method | Status |
|-----------|-------------------|--------|
| `sap_collector.py` | sapcontrol SOAP API (GetProcessList, ABAPGetWPTable) | **Real** — sends SOAP XML to sapcontrol HTTP port |
| `hana_collector.py` | hdbcli (SAP HANA client) — queries M_* monitoring views | **Real** — uses `hdbcli.dbapi` to connect and query |
| `oracle_collector.py` | Oracle DB client | **Real** |
| `os_collector.py` | OS-level metrics (psutil or similar) | **Real** |
| `db2_collector.py`, `mssql_collector.py`, `ase_collector.py`, `maxdb_collector.py` | DB-specific clients | **Real** |
| `cloud_collector.py` | Cloud provider APIs | **Real** |

**However:**
- There is **no RFC/BAPI integration** via `pyrfc` or `sapnwrfc`. The `RFC_BAPI` enum exists in `apps/api/src/domain/enums/index.ts:62` and is used as a connector type, but no actual RFC library is imported or used.
- The agent uses **sapcontrol SOAP API** (HTTP-based, not RFC) and **direct DB connections** (hdbcli, etc.)
- The agent is a legitimate monitoring collector, not a stub

---

### 5. "AI Analysis" Module

**Verdict: PARTIALLY TRUE — Chat uses real AI (Claude API), but AI module returns hardcoded data**

| Component | Behavior |
|-----------|----------|
| `modules/ai/ai.service.ts` | Returns **hardcoded** use case list and **template-based** insights derived from alert data. No real ML/AI model is invoked. |
| `modules/chat/chat.service.ts` | In `LOCAL_SIMULATED` mode: returns keyword-matched responses with real DB data. In `AWS_REAL` mode: **actually calls Claude API** via `https://api.anthropic.com/v1/messages` with SAP context from DB. Falls back to simulated if `ANTHROPIC_API_KEY` is not set. |

**Evidence:**
- `apps/api/src/modules/ai/ai.service.ts:8-45` — hardcoded use case array
- `apps/api/src/modules/ai/ai.service.ts:48-64` — generates templated "insights" from alert data (no AI model)
- `apps/api/src/modules/chat/chat.service.ts:49-151` — real Claude API integration with proper error handling, timeout, context building

---

### 6. HA Failover — Functional or Simulated?

**Verdict: PARTIALLY TRUE — Simulated in LOCAL_SIMULATED, real agent path exists for AWS_REAL**

**Evidence:**
- `apps/api/src/modules/ha/ha.service.ts:134-211` — `executeFailover()` runs step-by-step
- Line 157-159: If `LOCAL_SIMULATED`, calls `simulateFailoverStep()` which returns canned output after a random delay (200-800ms)
- Line 159: If not simulated, calls `executeViaAgent()` which sends real HTTP POST to the Spektra Agent's `/execute` endpoint
- The failover **state management** (DB updates, audit logging, step tracking) is real
- The actual SAP commands (`hdbnsutil -sr_takeover`, `sapcontrol -function StopSystem`, etc.) are correctly defined
- The agent execution path (`executeViaAgent`) is fully implemented with timeout handling

---

## Phase 8 — Security Review

### 1. Frontend Token Storage

**Severity: INFO**

JWT tokens (including the full user object) are stored in `localStorage` under key `sap-spektra-auth`.

- `frontend/src/contexts/AuthContext.tsx:67` — `localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser))`
- Token expiration is checked on load via `isTokenValid()` (line 10-12)
- On logout, storage is cleared (line 89)

**Assessment:** localStorage is acceptable for a demo/development app. For production, `httpOnly` cookies would be more secure against XSS. The token includes expiration checking, which is good.

---

### 2. GlobalExceptionFilter — Stack Trace Leakage

**Severity: LOW (Good)**

**File:** `apps/api/src/common/filters/http-exception.filter.ts`

The filter does **not** leak stack traces to clients. Line 58-64 shows the response only includes:
- `statusCode`, `message`, `correlationId`, `timestamp`, `path`

Stack traces are logged server-side only (line 44: `exception.stack` passed to `logger.error`).

For 500 errors, the client receives generic "Internal server error" (line 33).

**Assessment:** This is well-implemented. No stack trace leakage.

---

### 3. CORS Configuration

**Severity: LOW (Good)**

**File:** `apps/api/src/main.ts:28-31`

```typescript
app.enableCors({
  origin: corsOrigin,   // from CORS_ORIGIN env var, split by comma
  credentials: true,
});
```

- Default: `http://localhost:5173` (development only)
- Configurable via `CORS_ORIGIN` env var
- **Not** a wildcard (`*`) — specific origins required

**Assessment:** Properly configured. No wildcard CORS.

---

### 4. SQL Injection Vectors

**Severity: LOW (Good)**

**Evidence:**
- Only one raw query found: `apps/api/src/modules/health/prisma-health.indicator.ts:17` — `await this.prisma.$queryRaw\`SELECT 1\`;` (no user input, just a health check)
- All other database access uses Prisma ORM with parameterized queries
- `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` strips unknown properties

**Assessment:** No SQL injection vectors found. Prisma ORM provides parameterized queries by default.

---

### 5. Password Handling

**Severity: LOW (Good)**

| Check | Status |
|-------|--------|
| Hashing algorithm | bcryptjs with cost factor 12 (`auth.service.ts:105`, `users.service.ts:58`) |
| Password never logged | Confirmed — no `console.log` or `logger.*` calls include password values |
| Password not in API responses | Confirmed — `users.service.ts:24-32` maps to specific fields excluding `passwordHash`; `auth.service.ts:83-93` returns only safe fields |
| Password stored as `passwordHash` | Correct — Prisma model uses `passwordHash` column |

**Assessment:** Password handling follows best practices.

---

### 6. XSS Vectors in Frontend

**Severity: LOW (Good)**

- **Zero** instances of `dangerouslySetInnerHTML` in production code
- `innerHTML` references found only in test files (`StatusBadge.test.jsx`, `Pagination.test.tsx`, `Modal.test.tsx`) — these are test assertions, not production code
- Helmet middleware is enabled (`main.ts:25`) providing XSS protection headers

**Assessment:** No XSS vectors found in frontend production code.

---

### 7. Rate Limiting Coverage

**Severity: MEDIUM**

**Global:** 100 requests per 60 seconds via `@nestjs/throttler` (`app.module.ts:37`)

**Endpoint-specific limits:**

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/auth/login` | 10 | 60s |
| `POST /api/auth/register` | 5 | 60s |
| `POST /api/chat` | 20 | 60s |
| `POST /api/runbooks/:id/execute` | 10 | 60s |
| `POST /api/operations` | 10 | 60s |

**Missing endpoint-specific limits:**
- `POST /api/metrics/ingest` — high-frequency endpoint from agents, no specific throttle
- `POST /api/settings/api-keys` — API key creation, no specific throttle
- `PATCH /api/ha/:systemId/failover` — critical destructive operation, no specific throttle

**Assessment:** The global limit provides baseline protection, but some sensitive endpoints lack specific rate limits. The missing `failover` rate limit is the most notable gap, though the operation requires `admin` role.

---

### 8. Session Expiration Handling

**Severity: INFO**

- JWT default expiration: **24 hours** (`configuration.ts:61`)
- `ignoreExpiration: false` in JWT strategy (`jwt.strategy.ts:16`) — expired tokens are rejected
- Frontend checks expiration on load (`AuthContext.tsx:10-12`) and removes expired tokens
- Frontend auto-removes auth on 401 response (`useApi.ts:200`)
- No refresh token endpoint exists — when JWT expires, user must re-login

**Assessment:** Token expiration is properly enforced both server-side and client-side. The 24h default is long for a production system but acceptable for development/demo. No refresh token mechanism exists.

---

## Summary

### Claims Verification Summary

| # | Claim | Verdict | Details |
|---|-------|---------|---------|
| 1 | AWS_REAL mode with Cognito/S3/SQS/EventBridge | **FALSE** | Terraform infra exists; zero AWS SDK usage in application code |
| 2 | 97+ REST endpoints | **FALSE** | 78 actual endpoints |
| 3 | 123 runbooks seeded | **FALSE** | 119 runbooks seeded (18 base + 101 extra) |
| 4 | Agent with RFC/BAPI | **PARTIALLY TRUE** | Real sapcontrol SOAP + DB collectors exist; no actual RFC/BAPI library |
| 5 | AI analysis with real model | **PARTIALLY TRUE** | Chat module has real Claude API integration; AI module returns hardcoded data |
| 6 | HA failover functional | **PARTIALLY TRUE** | State management is real; command execution is simulated in LOCAL_SIMULATED, real path exists via agent |

### Security Findings Summary

| # | Finding | Severity | File(s) |
|---|---------|----------|---------|
| 1 | JWT stored in localStorage | **INFO** | `frontend/src/contexts/AuthContext.tsx:67` |
| 2 | No stack trace leakage | **LOW (Good)** | `apps/api/src/common/filters/http-exception.filter.ts:58-64` |
| 3 | CORS properly configured | **LOW (Good)** | `apps/api/src/main.ts:28-31` |
| 4 | No SQL injection vectors | **LOW (Good)** | All queries via Prisma ORM |
| 5 | Passwords properly handled | **LOW (Good)** | bcrypt cost 12, never logged, never returned in API |
| 6 | No XSS vectors found | **LOW (Good)** | Zero `dangerouslySetInnerHTML` in production code |
| 7 | Missing rate limits on sensitive endpoints | **MEDIUM** | `metrics.controller.ts:39`, `ha.controller.ts:36`, `settings.controller.ts:50` |
| 8 | 24h JWT expiration, no refresh tokens | **INFO** | `apps/api/src/config/configuration.ts:61` |

### No CRITICAL or HIGH severity security issues found.

The codebase demonstrates solid security practices overall. The main gap is the documentation overstating capabilities that exist only as infrastructure templates or configuration placeholders but lack runtime implementation.
