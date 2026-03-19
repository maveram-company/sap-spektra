# SAP Spektra v2.0.0-pilot Release Note

**Release date:** 2026-03-19
**Recommended tag:** `v2.0.0-pilot`
**Classification:** Pilot launch (controlled early-access customers)

---

## What's New

### SaaS Foundation

The platform is now deployed as a fully managed SaaS product on AWS:

- **Compute:** ECS Fargate (API) + CloudFront CDN (frontend)
- **Identity:** Amazon Cognito user pool with custom JWT validation
- **Billing:** Stripe integration for subscription lifecycle management
- **Database:** Amazon RDS PostgreSQL with Prisma ORM

### Identity Hardening

- Refresh token rotation with secure cookie storage
- Explicit logout (token invalidation on server side)
- Password policy enforcement (min length, complexity, history)
- API key authentication for machine-to-machine access (agents, CI/CD)
- JWT validation against JWKS endpoint

### Billing & Subscription Lifecycle

Full subscription state machine covering the complete customer lifecycle:

- **States:** `trialing` -> `active` -> `past_due` -> `suspended` -> `canceled`
- Stripe webhook verification (signature validation on all events)
- Quota enforcement tied to plan limits (systems, users, hosts)
- Trial period management with automatic expiration handling

### Agent Management

Lightweight agent protocol for SAP host connectivity:

- `POST /agents/register` -- register agent with system/host/version metadata
- `POST /agents/heartbeat` -- periodic health check with status tracking
- `POST /agents/revoke` -- decommission agent and clean up resources
- Agent version tracking for upgrade coordination

### Cloud Connector

SAP Cloud Connector integration for RISE and restricted environments:

- `POST /cloud-connector/configure` -- set up connection profile (locationId, virtualHost, port)
- `POST /cloud-connector/:systemId/test` -- validate connectivity
- `GET /cloud-connector/:systemId/limitations` -- retrieve feature restrictions for RISE systems
- Clear UI indicators when OS-level features are unavailable

### Multi-Mode Architecture

Four operational modes that determine data sourcing and feature availability:

| Mode | Description |
|------|-------------|
| `live` | Real-time data from connected SAP systems |
| `demo` | Synthetic data for demonstrations and trials |
| `hybrid` | Mix of live and demo data during onboarding |
| `mock` | Fully mocked backend for development and testing |

- **12 functional domains:** Dashboard, Systems, Alerts, Runbooks, Approvals, HA Control, Analytics, Connectors, Events, Transports, Certificates, SLA
- **ProviderResult** pattern: every data response carries source metadata (mode, provider, timestamp, confidence)
- **UI indicators:** ModeBadge (global mode), SourceIndicator (per-component data origin), EvidencePanel (expandable provenance detail)

### Security Fixes

9 critical security issues resolved in this release cycle:

1. XSS sanitization on all user-facing inputs
2. Race condition fixes in subscription state transitions
3. Tenant isolation enforcement on every database query
4. JWT user validation (reject tokens for deleted/disabled users)
5. Cascade deletes to prevent orphaned records
6. Host ID index for query performance under load
7. Safe string replacement (eliminate regex injection)
8. Centralized configuration (remove scattered env access)
9. Logging hardening (strip sensitive fields from log output)

---

## Validated Metrics

| Metric | Value |
|--------|-------|
| Backend test suites | 57 |
| Backend tests | 470 |
| Frontend test suites | 86 |
| Frontend tests | 1,061 |
| **Total tests** | **1,531** |
| TypeScript errors | 0 |
| API endpoints verified live | 38 |

---

## Known Risks

| Risk | Status | Notes |
|------|--------|-------|
| MFA | Deferred | Not included in pilot; strong passwords + API key rotation as interim |
| Email sending | Not connected | Cognito/SES integration stubbed but not wired to production SMTP |
| Password reset | Placeholder | Reset flow exists in UI but backend handler is a stub |
| Database-level RLS | Not implemented | Tenant isolation enforced at application layer only |
| Terraform state | Local | State file is local; remote backend (S3 + DynamoDB) not yet configured |

---

## Schema Changes

### New Prisma Models (5)

1. `Subscription` -- billing subscription with plan, status, Stripe references
2. `Plan` -- pricing tier definition (limits, features, price)
3. `Agent` -- registered agent with system/host binding and heartbeat tracking
4. `CloudConnectorConfig` -- Cloud Connector profile per system
5. `ApiKey` -- hashed API key for machine authentication

### New Dependencies

| Package | Purpose |
|---------|---------|
| `@nestjs/schedule` | Cron-based background jobs (heartbeat expiry, trial expiration) |
| `jwks-rsa` | JWKS endpoint fetching for Cognito JWT validation |

### New Environment Variables

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (frontend) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint signing secret |
| `STRIPE_STARTER_PRICE_ID` | Stripe Price ID for Starter tier |
| `STRIPE_PROFESSIONAL_PRICE_ID` | Stripe Price ID for Professional tier |
| `STRIPE_ENTERPRISE_PRICE_ID` | Stripe Price ID for Enterprise tier |

---

## Seed Data Updates

The seed script (`prisma/seed.ts`) has been updated with:

- **Pricing tiers:** Starter $299/mo, Professional $999/mo, Enterprise $2,499/mo
- **Seed tenant subscription:** Active Professional subscription attached to the default seed organization
- **119 runbooks** across SAP, database, and OS categories
- **12 sample SAP systems** covering S/4HANA, ECC, BW, PO, CRM, and others
- **Agent records** with connected status for seed systems

---

## Upgrade Path

This is the initial pilot release. There is no upgrade path from prior versions. Deployments should be provisioned fresh using the Terraform configuration and seed data.

---

## Next Milestones

- MFA enrollment (TOTP via Cognito)
- Email delivery integration (SES)
- Password reset flow (end-to-end)
- Terraform remote state backend
- Database-level row-level security
- Production monitoring and alerting (CloudWatch dashboards)
