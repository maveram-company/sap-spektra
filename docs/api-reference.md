# SAP Spektra — API Reference

## Overview

- **Base URL:** `http://localhost:3001/api`
- **Auth:** Bearer JWT token in `Authorization` header (except public endpoints)
- **Content-Type:** `application/json`
- **Swagger UI:** `http://localhost:3001/api/docs`
- **Global rate limit:** 100 requests per 60 seconds

## Authentication

All authenticated endpoints require a JWT token obtained from `/api/auth/login`:

```
Authorization: Bearer <jwt_token>
```

The JWT payload contains:

```json
{
  "sub": "user-uuid",
  "email": "admin@acme-corp.com",
  "organizationId": "org-uuid",
  "role": "admin"
}
```

## Role Hierarchy

| Role | Level | Can Access |
|------|-------|-----------|
| `admin` | 40 | Everything |
| `escalation` | 30 | Approvals + operator + viewer |
| `operator` | 20 | Write operations + viewer |
| `viewer` | 10 | Read-only |

An endpoint marked `operator` is accessible by operator, escalation, and admin.

## Error Response Format

```json
{
  "statusCode": 403,
  "message": "Insufficient role privileges",
  "correlationId": "uuid",
  "timestamp": "2026-03-17T12:00:00.000Z",
  "path": "/api/systems"
}
```

---

## Auth

Authentication and user identity. No tenant guard.

### POST /api/auth/login

Login with email and password.

- **Role:** Public
- **Rate limit:** 10 requests per 60 seconds

**Request body:**

```json
{
  "email": "admin@acme-corp.com",
  "password": "admin123"
}
```

**Response (200):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "admin@acme-corp.com",
    "name": "Admin User",
    "role": "admin",
    "organizationId": "uuid",
    "organizationName": "ACME Corp"
  }
}
```

### POST /api/auth/register

Register a new user and organization.

- **Role:** Public
- **Rate limit:** 5 requests per 60 seconds

**Request body:**

```json
{
  "email": "user@company.com",
  "password": "securepass123",
  "name": "Jane Doe",
  "organizationName": "Company Inc"
}
```

**Response (201):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@company.com",
    "name": "Jane Doe",
    "role": "admin",
    "organizationId": "uuid",
    "organizationName": "Company Inc"
  }
}
```

### GET /api/auth/me

Get current user profile from JWT.

- **Role:** Any authenticated user

**Response (200):**

```json
{
  "sub": "user-uuid",
  "email": "admin@acme-corp.com",
  "organizationId": "org-uuid",
  "role": "admin"
}
```

---

## Health

Service health checks. No auth required.

### GET /api/health

Comprehensive health check (database, memory heap, disk).

- **Role:** Public

**Response (200):**

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "memory_heap": { "status": "up" },
    "disk": { "status": "up" }
  }
}
```

### GET /api/health/liveness

Simple liveness probe.

- **Role:** Public

**Response (200):**

```json
{
  "status": "ok",
  "timestamp": "2026-03-17T12:00:00.000Z"
}
```

---

## Plans

Subscription plan listing. Public endpoints, no auth required.

### GET /api/plans

List all available plans.

- **Role:** Public

**Response (200):**

```json
[
  {
    "id": "uuid",
    "tier": "starter",
    "name": "Starter",
    "price": 0,
    "features": ["..."],
    "limits": { "maxSystems": 3, "maxUsers": 5 }
  }
]
```

### GET /api/plans/:tier

Get plan details by tier.

- **Role:** Public
- **Path params:** `tier` — starter, professional, or enterprise

**Response (200):**

```json
{
  "id": "uuid",
  "tier": "professional",
  "name": "Professional",
  "price": 9900,
  "features": ["..."],
  "limits": { "maxSystems": 25, "maxUsers": 50 }
}
```

---

## Dashboard

Aggregated dashboard summary.

### GET /api/dashboard

Get dashboard summary (system counts, alert counts, operation status, etc.).

- **Role:** viewer

**Response (200):**

```json
{
  "systems": { "total": 12, "healthy": 8, "warning": 3, "critical": 1 },
  "alerts": { "active": 5, "critical": 2 },
  "operations": { "running": 1, "scheduled": 3 },
  "approvals": { "pending": 2 }
}
```

---

## Systems

SAP system management.

### GET /api/systems

List all SAP systems in the organization.

- **Role:** viewer

**Response (200):**

```json
[
  {
    "id": "uuid",
    "sid": "EP1",
    "description": "S/4HANA Production",
    "sapProduct": "S/4HANA 2023",
    "dbType": "SAP HANA 2.0",
    "environment": "PRD",
    "status": "healthy",
    "healthScore": 92
  }
]
```

### GET /api/systems/health-summary

Get health summary for all systems.

- **Role:** viewer

### GET /api/systems/:id

Get system by ID with full details (components, instances, hosts, HA config).

- **Role:** viewer
- **Path params:** `id` — System UUID

### POST /api/systems

Register a new SAP system.

- **Role:** admin

**Request body:**

```json
{
  "sid": "NP1",
  "description": "New Production System",
  "sapProduct": "S4HANA",
  "productFamily": "ABAP_BUSINESS_SUITE",
  "sapStackType": "ABAP",
  "dbType": "SAP HANA 2.0",
  "environment": "PRD",
  "deploymentModel": "ON_PREMISE",
  "connectionMode": "AGENT_FULL"
}
```

### PATCH /api/systems/:id

Update system configuration.

- **Role:** operator
- **Path params:** `id` — System UUID

**Request body (all fields optional):**

```json
{
  "description": "Updated description",
  "status": "warning",
  "deploymentModel": "RISE_MANAGED",
  "connectionMode": "MANAGED_RESTRICTED"
}
```

### DELETE /api/systems/:id

Deregister a system. Cascades to delete all related data (components, hosts, metrics, alerts, etc.).

- **Role:** admin
- **Path params:** `id` — System UUID

---

## Metrics

Host metrics, health snapshots, breaches, dependencies, and components.

### POST /api/metrics/ingest

Ingest a metric data point from the agent.

- **Role:** operator

**Request body:**

```json
{
  "hostId": "host-uuid",
  "cpu": 72.5,
  "memory": 68.3,
  "disk": 45.1,
  "iops": 1200,
  "networkIn": 50000,
  "networkOut": 30000
}
```

### GET /api/metrics/hosts/:hostId

Get host metrics time-series.

- **Role:** viewer
- **Path params:** `hostId` — Host UUID
- **Query params:** `hours` (optional, default 24, range 1-8760)

### GET /api/metrics/systems/:systemId/hosts

Get all host metrics for a system.

- **Role:** viewer
- **Path params:** `systemId` — System UUID
- **Query params:** `hours` (optional, default 24, range 1-8760)

### GET /api/metrics/systems/:systemId/health

Get health snapshots for a system.

- **Role:** viewer
- **Path params:** `systemId` — System UUID
- **Query params:** `hours` (optional, default 24, range 1-8760)

### GET /api/metrics/breaches

List threshold breaches.

- **Role:** viewer
- **Query params:**
  - `systemId` (optional) — Filter by system
  - `resolved` (optional) — `"true"` or `"false"`

### GET /api/metrics/systems/:systemId/dependencies

Get system dependencies (RFC, HTTP, IDoc connections).

- **Role:** viewer
- **Path params:** `systemId` — System UUID

### GET /api/metrics/systems/:systemId/hosts-detail

Get hosts with instances for a system.

- **Role:** viewer
- **Path params:** `systemId` — System UUID

### GET /api/metrics/systems/:systemId/components

Get components with instances for a system.

- **Role:** viewer
- **Path params:** `systemId` — System UUID

### GET /api/metrics/system-meta

Get system metadata (SAP release, kernel version, patches).

- **Role:** viewer
- **Query params:** `systemId` (optional) — Filter by system; returns all if omitted

---

## Alerts

Alert management with lifecycle support.

### GET /api/alerts

List alerts with optional filters.

- **Role:** viewer
- **Query params:**
  - `status` (optional) — `active`, `acknowledged`, `resolved`
  - `level` (optional) — `info`, `warning`, `critical`
  - `systemId` (optional) — Filter by system

### GET /api/alerts/stats

Get alert statistics (counts by status and level).

- **Role:** viewer

### PATCH /api/alerts/:id/acknowledge

Acknowledge an alert. Sets `acknowledged=true`, `ackBy`, `ackAt`.

- **Role:** operator
- **Path params:** `id` — Alert UUID

### PATCH /api/alerts/:id/resolve

Resolve an alert. Sets `resolved=true`, `resolvedBy`, `resolvedAt`.

- **Role:** operator
- **Path params:** `id` — Alert UUID

**Request body (optional):**

```json
{
  "category": "false_positive",
  "note": "Threshold was too aggressive for this workload"
}
```

---

## Events

Event log with filtering.

### GET /api/events

List events with optional filters.

- **Role:** viewer
- **Query params:**
  - `level` (optional) — `critical`, `warning`, `info`, `success`
  - `source` (optional) — `SAP`, `Platform`, `Security`
  - `systemId` (optional) — Filter by system
  - `limit` (optional) — Max number of results

---

## Approvals

Approval workflow lifecycle.

### GET /api/approvals

List approval requests.

- **Role:** viewer
- **Query params:**
  - `status` (optional) — `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`, `EXECUTED`
  - `systemId` (optional) — Filter by system

### GET /api/approvals/:id

Get approval request by ID.

- **Role:** viewer
- **Path params:** `id` — Approval UUID

### POST /api/approvals

Create an approval request.

- **Role:** operator

**Request body:**

```json
{
  "systemId": "system-uuid",
  "severity": "high",
  "description": "Emergency maintenance window for EP1",
  "runbookId": "runbook-uuid",
  "metric": "cpu_usage",
  "value": 95.2
}
```

### PATCH /api/approvals/:id/approve

Approve a pending request.

- **Role:** escalation
- **Path params:** `id` — Approval UUID

### PATCH /api/approvals/:id/reject

Reject a pending request.

- **Role:** escalation
- **Path params:** `id` — Approval UUID

---

## Runbooks

Runbook management and execution with compatibility validation.

### GET /api/runbooks

List all runbooks.

- **Role:** viewer
- **Query params:** `category` (optional) — Filter by category (SAP_HANA, ORACLE, LINUX_OS, etc.)

### GET /api/runbooks/executions

List all runbook executions across the organization.

- **Role:** viewer

### GET /api/runbooks/executions/:executionId

Get execution detail with step-by-step results.

- **Role:** viewer
- **Path params:** `executionId` — Execution UUID

**Response (200):**

```json
{
  "id": "uuid",
  "runbookId": "uuid",
  "systemId": "uuid",
  "gate": "SAFE",
  "result": "SUCCESS",
  "totalSteps": 5,
  "completedSteps": 5,
  "currentStep": 5,
  "stepResults": [
    {
      "stepOrder": 1,
      "action": "Check HANA status",
      "command": "HDB info",
      "status": "SUCCESS",
      "exitCode": 0,
      "stdout": "...",
      "duration": "2s"
    }
  ]
}
```

### GET /api/runbooks/:id

Get runbook by ID (includes steps, prerequisites, parameters).

- **Role:** viewer
- **Path params:** `id` — Runbook UUID

### POST /api/runbooks/:id/execute

Execute a runbook on a system. Validates system compatibility before execution.

- **Role:** operator
- **Rate limit:** 10 requests per 60 seconds
- **Path params:** `id` — Runbook UUID
- **HTTP Status:** 202 Accepted

**Request body:**

```json
{
  "systemId": "system-uuid",
  "dryRun": false
}
```

Compatibility checks include:
- Database type matches runbook requirements
- SAP stack type is compatible
- Operating system is supported
- HA configuration prerequisites are met
- System is not RISE_RESTRICTED (unless permitted)

---

## Operations

Operations scheduling, jobs, transports, and certificates.

### GET /api/operations

List operations with optional filters.

- **Role:** viewer
- **Query params:**
  - `status` (optional) — `SCHEDULED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`
  - `type` (optional) — `BACKUP`, `RESTART`, `MAINTENANCE`, `DR_DRILL`, `HOUSEKEEPING`
  - `systemId` (optional) — Filter by system

### POST /api/operations

Schedule a new operation.

- **Role:** operator
- **Rate limit:** 10 requests per 60 seconds

**Request body:**

```json
{
  "systemId": "system-uuid",
  "type": "BACKUP",
  "description": "Weekly HANA backup for EP1",
  "riskLevel": "LOW",
  "scheduledTime": "2026-03-18T02:00:00Z",
  "schedule": "0 2 * * 0"
}
```

### PATCH /api/operations/:id/status

Update operation status.

- **Role:** operator
- **Path params:** `id` — Operation UUID

**Request body:**

```json
{
  "status": "COMPLETED"
}
```

Valid statuses: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `CANCELLED`

### GET /api/operations/jobs

List SAP background job records.

- **Role:** viewer
- **Query params:** `systemId` (optional) — Filter by system

### GET /api/operations/transports

List SAP transport records.

- **Role:** viewer
- **Query params:** `systemId` (optional) — Filter by system

### GET /api/operations/certificates

List SSL/SAML/SNC certificate records.

- **Role:** viewer
- **Query params:** `systemId` (optional) — Filter by system

---

## HA/DR

High Availability and Disaster Recovery management.

### GET /api/ha

List all HA configurations across all systems.

- **Role:** viewer

### GET /api/ha/:systemId

Get HA configuration for a specific system.

- **Role:** viewer
- **Path params:** `systemId` — System UUID

**Response (200):**

```json
{
  "id": "uuid",
  "systemId": "uuid",
  "haEnabled": true,
  "haStrategy": "HOT_STANDBY",
  "primaryNode": "ep1-hana01",
  "secondaryNode": "ep1-hana02",
  "rpoMinutes": 0,
  "rtoMinutes": 15,
  "status": "standby"
}
```

### PATCH /api/ha/:systemId/failover

Trigger a failover for a system. This is a critical operation.

- **Role:** admin
- **Path params:** `systemId` — System UUID

### PATCH /api/ha/:systemId/status

Update HA status.

- **Role:** operator
- **Path params:** `systemId` — System UUID

**Request body:**

```json
{
  "status": "standby"
}
```

Valid statuses: `standby`, `failover_in_progress`, `failed_over`

### GET /api/ha/:systemId/prereqs

Get HA prerequisites checklist for a system.

- **Role:** viewer
- **Path params:** `systemId` — System UUID

### GET /api/ha/:systemId/ops-history

Get HA operations history for a system.

- **Role:** viewer
- **Path params:** `systemId` — System UUID

### GET /api/ha/:systemId/drivers

Get HA driver information for a system (Pacemaker, Corosync, etc.).

- **Role:** viewer
- **Path params:** `systemId` — System UUID

---

## Chat

AI assistant for SAP operations guidance.

### POST /api/chat

Send a message to the AI assistant.

- **Role:** viewer (all authenticated roles)
- **Rate limit:** 20 requests per 60 seconds

**Request body:**

```json
{
  "message": "How do I resolve a HANA memory alert?",
  "context": {
    "systemId": "system-uuid"
  }
}
```

**Response (200):**

```json
{
  "reply": "To resolve a HANA memory alert, you can...",
  "suggestions": ["Check indexserver memory allocation", "Review HANA memory configuration"],
  "relatedRunbooks": ["uuid-1", "uuid-2"]
}
```

---

## Analytics

Overview, runbook execution analytics, and system health trends.

### GET /api/analytics/overview

Get analytics overview (aggregated metrics across all systems).

- **Role:** viewer

### GET /api/analytics/runbooks

Get runbook execution analytics (success rate, frequency, top runbooks).

- **Role:** viewer

### GET /api/analytics/systems/:systemId/trends

Get system health trends over time.

- **Role:** viewer
- **Path params:** `systemId` — System UUID
- **Query params:** `days` (optional, default 7)

---

## Connectors

System connector management and connectivity validation.

### GET /api/connectors

List all connectors for the organization.

- **Role:** viewer

**Response (200):**

```json
[
  {
    "id": "uuid",
    "systemId": "uuid",
    "method": "Spektra Agent",
    "status": "connected",
    "latencyMs": 45,
    "version": "1.2.0",
    "lastHeartbeat": "2026-03-17T11:59:30Z"
  }
]
```

### GET /api/connectors/:id

Get connector by ID.

- **Role:** viewer
- **Path params:** `id` — Connector UUID

### PATCH /api/connectors/:id/heartbeat

Update connector heartbeat timestamp.

- **Role:** operator
- **Path params:** `id` — Connector UUID

### GET /api/connectors/validate/all

Validate connectivity of all connectors in the organization.

- **Role:** operator

### GET /api/connectors/:id/validate

Validate connectivity of a specific connector.

- **Role:** operator
- **Path params:** `id` — Connector UUID

---

## Users

User management within the organization.

### GET /api/users

List all users in the organization (via memberships).

- **Role:** viewer

### GET /api/users/:id

Get user by ID.

- **Role:** viewer
- **Path params:** `id` — User UUID

### POST /api/users

Create or invite a user to the organization.

- **Role:** admin

**Request body:**

```json
{
  "email": "newuser@acme-corp.com",
  "name": "New User",
  "password": "securepass123",
  "role": "operator"
}
```

### PATCH /api/users/:id

Update user role or status.

- **Role:** admin
- **Path params:** `id` — User UUID

**Request body (all fields optional):**

```json
{
  "name": "Updated Name",
  "role": "escalation",
  "status": "disabled"
}
```

### DELETE /api/users/:id

Remove user from the organization (deletes membership).

- **Role:** admin
- **Path params:** `id` — User UUID

---

## Tenant

Organization/tenant management.

### GET /api/tenant

Get current organization details.

- **Role:** viewer

### PATCH /api/tenant

Update organization settings.

- **Role:** admin

**Request body:**

```json
{
  "name": "ACME Corp Updated",
  "timezone": "America/New_York",
  "language": "en"
}
```

### GET /api/tenant/stats

Get organization statistics (system count, user count, alert counts, etc.).

- **Role:** viewer

---

## Settings

Organization settings and API key management.

### GET /api/settings

Get organization settings.

- **Role:** admin

### PATCH /api/settings

Update organization settings.

- **Role:** admin

### GET /api/settings/api-keys

List all API keys for the organization.

- **Role:** admin

**Response (200):**

```json
[
  {
    "id": "uuid",
    "name": "CI/CD Pipeline",
    "prefix": "sk_live_",
    "status": "active",
    "createdAt": "2026-03-01T00:00:00Z",
    "lastUsedAt": "2026-03-17T10:30:00Z"
  }
]
```

### POST /api/settings/api-keys

Create a new API key. The full key is returned only once.

- **Role:** admin

**Request body:**

```json
{
  "name": "CI/CD Pipeline"
}
```

**Response (201):**

```json
{
  "id": "uuid",
  "name": "CI/CD Pipeline",
  "key": "sk_live_abc123...",
  "prefix": "sk_live_"
}
```

### PATCH /api/settings/api-keys/:id/revoke

Revoke an API key (sets status to `inactive`).

- **Role:** admin
- **Path params:** `id` — API Key UUID

---

## Audit

Audit log for compliance and debugging.

### GET /api/audit

List audit log entries.

- **Role:** admin
- **Query params:**
  - `severity` (optional) — `info`, `warning`, `critical`
  - `action` (optional) — Filter by action (e.g., `system.register`)
  - `limit` (optional) — Max number of results

**Response (200):**

```json
[
  {
    "id": "uuid",
    "userEmail": "admin@acme-corp.com",
    "action": "system.register",
    "resource": "System EP1",
    "details": "Registered new SAP system",
    "severity": "info",
    "timestamp": "2026-03-17T10:00:00Z"
  }
]
```

---

## Landscape

Landscape validation across all systems.

### GET /api/landscape/validation

Get landscape validation checks for all systems (connectivity, version compliance, security checks).

- **Role:** viewer

---

## AI

AI use cases and generated insights.

### GET /api/ai/use-cases

Get available AI use cases (anomaly detection, capacity planning, remediation suggestions, etc.).

- **Role:** viewer

### GET /api/ai/responses

Get recent AI-generated responses and insights for the organization.

- **Role:** viewer

---

## Licenses

SAP license information.

### GET /api/licenses

Get license information for all systems in the organization.

- **Role:** viewer

---

## Endpoint Count Summary

| Controller | Endpoints | Auth Required |
|-----------|-----------|--------------|
| Auth | 3 | Partial (login/register public, /me authenticated) |
| Health | 2 | No |
| Plans | 2 | No |
| Dashboard | 1 | Yes |
| Systems | 6 | Yes |
| Metrics | 9 | Yes |
| Alerts | 4 | Yes |
| Events | 1 | Yes |
| Approvals | 5 | Yes |
| Runbooks | 5 | Yes |
| Operations | 6 | Yes |
| HA/DR | 7 | Yes |
| Chat | 1 | Yes |
| Analytics | 3 | Yes |
| Connectors | 5 | Yes |
| Users | 5 | Yes |
| Tenant | 3 | Yes |
| Settings | 5 | Yes |
| Audit | 1 | Yes |
| Landscape | 1 | Yes |
| AI | 2 | Yes |
| Licenses | 1 | Yes |
| **Total** | **78** | — |
