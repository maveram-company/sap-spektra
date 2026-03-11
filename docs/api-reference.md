# SAP Spektra — API Reference

Base URL: `http://localhost:3001/api`
Swagger UI: `http://localhost:3001/api/docs`

## Authentication

### POST /auth/login
```json
{ "email": "admin@acme-corp.com", "password": "admin123" }
→ { "accessToken": "eyJ...", "user": { "id", "email", "name", "role", "organizationId", "organizationName" } }
```

### POST /auth/register
```json
{ "email": "...", "password": "...", "name": "...", "organizationName": "..." }
→ Same as login response
```

### GET /auth/me
Returns current user from JWT.

## Health
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Service health check |

## Dashboard
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/dashboard` | JWT | Aggregated summary (systems, alerts, approvals, events) |

## Systems
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/systems` | viewer | List all systems |
| GET | `/systems/:id` | viewer | Get system with full details |
| GET | `/systems/health-summary` | viewer | Health summary across all systems |
| POST | `/systems` | admin | Register new system |
| PATCH | `/systems/:id` | operator | Update system |
| DELETE | `/systems/:id` | admin | Deregister system |

## Alerts
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/alerts?status=&level=&systemId=` | viewer | List alerts with filters |
| GET | `/alerts/stats` | viewer | Alert statistics |
| PATCH | `/alerts/:id/acknowledge` | operator | Acknowledge alert |
| PATCH | `/alerts/:id/resolve` | operator | Resolve alert |

## Events
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/events?level=&source=&systemId=&limit=` | viewer | List events |

## Approvals
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/approvals?status=&systemId=` | viewer | List approvals |
| GET | `/approvals/:id` | viewer | Get approval detail |
| POST | `/approvals` | operator | Create approval request |
| PATCH | `/approvals/:id/approve` | escalation | Approve request |
| PATCH | `/approvals/:id/reject` | escalation | Reject request |

## Runbooks
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/runbooks` | viewer | List runbooks |
| GET | `/runbooks/:id` | viewer | Get runbook detail |
| GET | `/runbooks/executions` | viewer | List all executions |
| POST | `/runbooks/:id/execute` | operator | Execute runbook |

## Operations
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/operations?status=&type=&systemId=` | viewer | List operations |
| POST | `/operations` | operator | Schedule operation |
| PATCH | `/operations/:id/status` | operator | Update status |
| GET | `/operations/jobs?systemId=` | viewer | List background jobs |
| GET | `/operations/transports?systemId=` | viewer | List transports |
| GET | `/operations/certificates?systemId=` | viewer | List certificates |

## Metrics
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/metrics/hosts/:hostId?hours=` | viewer | Host metric time-series |
| GET | `/metrics/systems/:id/hosts?hours=` | viewer | All host metrics for system |
| GET | `/metrics/systems/:id/health?hours=` | viewer | Health snapshots |
| GET | `/metrics/breaches?systemId=&resolved=` | viewer | Threshold breaches |
| GET | `/metrics/systems/:id/dependencies` | viewer | System dependencies |
| GET | `/metrics/systems/:id/hosts-detail` | viewer | Hosts with instances |
| GET | `/metrics/systems/:id/components` | viewer | Components with instances |
| GET | `/metrics/system-meta?systemId=` | viewer | System metadata |

## HA/DR
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/ha` | viewer | List HA configurations |
| GET | `/ha/:systemId` | viewer | Get HA config by system |
| PATCH | `/ha/:systemId/failover` | admin | Trigger failover |
| PATCH | `/ha/:systemId/status` | operator | Update HA status |

## Connectors
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/connectors` | viewer | List connectors |
| GET | `/connectors/:id` | viewer | Get connector detail |
| PATCH | `/connectors/:id/heartbeat` | operator | Update heartbeat |

## Users
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/users` | viewer | List org users |
| GET | `/users/:id` | viewer | Get user detail |
| POST | `/users` | admin | Create/invite user |
| PATCH | `/users/:id` | admin | Update user |
| DELETE | `/users/:id` | admin | Remove from org |

## Tenant
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/tenant` | viewer | Get organization |
| PATCH | `/tenant` | admin | Update organization |
| GET | `/tenant/stats` | viewer | Org statistics |

## Analytics
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/analytics/overview` | viewer | Full analytics overview |
| GET | `/analytics/runbooks` | viewer | Runbook execution stats |
| GET | `/analytics/systems/:id/trends?days=` | viewer | System health trends |

## Chat
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/chat` | JWT | AI assistant message |

## Plans
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/plans` | No | List all plans |
| GET | `/plans/:tier` | No | Get plan by tier |

## Settings
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/settings` | admin | Get org settings |
| PATCH | `/settings` | admin | Update settings |
| GET | `/settings/api-keys` | admin | List API keys |
| POST | `/settings/api-keys` | admin | Create API key |
| PATCH | `/settings/api-keys/:id/revoke` | admin | Revoke API key |

## Audit
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/audit?severity=&action=&limit=` | admin | Audit log |
