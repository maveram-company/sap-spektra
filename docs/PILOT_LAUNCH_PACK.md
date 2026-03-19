# SAP Spektra -- Pilot Launch Pack

---

## Executive One-Pager

**SAP Spektra** is a SaaS platform for SAP operations monitoring, automation, and governance. It provides a unified control plane for managing SAP landscapes across hybrid environments.

**Deployment:** AWS (Maveram account) -- ECS Fargate, CloudFront, RDS PostgreSQL, Cognito, Stripe.

**Architecture:** Multi-tenant, organization-isolated, with agent-based or Cloud Connector connectivity to customer SAP systems.

**Scale:**
- 4 operational modes (live, demo, hybrid, mock)
- 12 functional domains (Dashboard, Systems, Alerts, Runbooks, Approvals, HA Control, Analytics, Connectors, Events, Transports, Certificates, SLA)
- 32 data models
- 95+ API endpoints

**Status:** Pilot-ready for controlled early customers. 1,531 tests passing, 0 TypeScript errors, 38 API endpoints verified live.

---

## Pilot Scope

| Parameter | Value |
|-----------|-------|
| Target customers | 1-3 controlled customers |
| Duration | 30-60 days |
| Plan | Professional tier ($999/mo, waived during pilot) |
| Systems per customer | Up to 15 SAP systems |
| Connectivity | Agent preferred; Cloud Connector for RISE environments |
| Support model | Direct engineering support, weekly check-in calls |

### Selection Criteria for Pilot Customers

- Existing relationship with Maveram team
- SAP landscape with 3-15 systems (mix of products preferred)
- Willingness to install agent on SAP hosts (or RISE with Cloud Connector)
- Dedicated technical contact available for weekly calls
- Comfortable with early-access software (known limitations documented)

---

## Pricing & Packaging Sheet

### Monthly Plans

| Tier | Price | Systems | Users | Key Features |
|------|-------|---------|-------|--------------|
| Starter | $299/mo | 3 | 5 | Monitoring, alerts, dashboard |
| Professional | $999/mo | 15 | 25 | + Runbooks, approvals, analytics, API access |
| Enterprise | $2,499/mo | Unlimited | Unlimited | + SSO, HA/DR, audit log, custom connectors |

### Add-Ons

| Add-On | Price | Notes |
|--------|-------|-------|
| Additional SAP system | $49-99/mo | Varies by system product/size |
| Additional host | $29-49/mo | Per monitored host |
| HA/DR module | $299/mo/landscape | High availability and disaster recovery controls |
| Evidence retention | $0.50/GB/mo | Extended storage for audit and compliance evidence |

### Pilot Terms

- Professional tier at $0/mo for pilot duration (30-60 days)
- Automatic conversion to paid subscription at pilot end
- 30-day notice required to cancel before billing begins
- No long-term commitment required

---

## Onboarding Checklist

Use this checklist for each new customer onboarding:

- [ ] **1. Create tenant** -- Sign up via `/auth/register` or create manually via seed
- [ ] **2. Verify email** -- Customer confirms email address
- [ ] **3. Select plan** -- Professional tier for pilot customers
- [ ] **4. Add admin user** -- First user with admin role configured
- [ ] **5. Register SAP landscapes/systems** -- Enter SID, product, environment, database type
- [ ] **6. Define connectivity profile per system** -- Agent or Cloud Connector
- [ ] **7. Install agent OR configure Cloud Connector** -- Deploy on each SAP host or set up CC profile
- [ ] **8. Validate heartbeat/connectivity** -- Confirm agent status = connected or CC test passes
- [ ] **9. Verify dashboard data** -- System cards, health gauges, and KPIs rendering
- [ ] **10. Configure alert thresholds** -- Set thresholds per system based on customer SLAs
- [ ] **11. Test runbook execution (dry-run)** -- Execute a non-destructive runbook to validate pipeline
- [ ] **12. Set up approval workflow** -- Configure approval policies for critical operations
- [ ] **13. Invite team members** -- Send invitations for customer's operations team
- [ ] **14. Review analytics** -- Walk through trends, execution stats, and health history
- [ ] **15. Sign-off** -- Customer confirms onboarding complete and enters steady-state

---

## First Customer Ops Runbook

Step-by-step guide for the Maveram team to onboard the first pilot customer.

### Pre-Call Preparation

1. **Confirm SAP landscape inventory** -- Request a list of all SAP systems (SID, product, version, database, OS, environment). Clarify which are on-premise vs. RISE.
2. **Identify OS types** -- Determine Linux distribution and version for each host (required for agent package selection).
3. **Determine RISE status** -- Any RISE systems will use Cloud Connector; confirm customer has Cloud Connector already installed and configured in their SAP BTP subaccount.

### Tenant Setup

4. **Create tenant via API or seed** -- `POST /auth/register` with the customer organization name and admin email. Alternatively, add to the seed script for reproducibility.
5. **Generate API keys for agents** -- `POST /settings/api-keys` to create one API key per agent deployment group.
6. **Share agent installer** -- Provide the correct agent package for the customer's OS (Linux amd64, Linux arm64, etc.).

### Installation & Validation

7. **Guide agent installation** -- Walk the customer through installation via SSH or their remote access tool. Agent registers automatically on startup.
8. **Validate metrics arriving in dashboard** -- Confirm system cards populate within 2-5 minutes of agent startup.
9. **Configure alert thresholds per system** -- Set CPU, memory, disk, and database thresholds based on customer's operational standards.

### Steady State

10. **Schedule weekly review calls** -- 30-minute calls to review platform health, discuss issues, and gather feedback.
11. **Escalation path** -- Engineering Slack channel for urgent issues (response target: < 2 hours during business hours).
12. **Issue tracking** -- All issues logged as GitHub issues with `pilot` label for prioritization.

---

## Demo Flow

Use this script when demonstrating SAP Spektra to prospective pilot customers or stakeholders.

1. **Login as admin** -- Show multi-tenant login. Explain that each customer has an isolated organization.

2. **Dashboard overview** -- Highlight KPIs (system count, alert count, health score), system cards with status indicators, and health gauges.

3. **Systems list** -- Show 12 SAP systems across different products (S/4HANA, ECC, BW, PO, CRM). Point out environment labels (Production, QA, Development).

4. **System detail** -- Drill into one system. Show metrics, hosts, instances, and any threshold breaches. Explain how data flows from agent to dashboard.

5. **Alerts** -- Demonstrate the alert lifecycle: active -> acknowledged -> resolved. Show filtering by severity and system.

6. **Runbooks** -- Browse the library (119 runbooks across SAP, database, and OS categories). Execute a dry-run on a non-critical runbook. Show the execution log.

7. **Approvals** -- Show the approval workflow: request -> approve/reject. Explain how critical operations require sign-off before execution.

8. **HA Control Center** -- Display HA readiness status for a landscape. Walk through a failover simulation (dry-run mode).

9. **Analytics** -- Show trend charts (system health over time, alert frequency). Display runbook execution stats (success rate, average duration).

10. **Settings** -- Show API key management, user administration, and plan details.

11. **Mode indicators** -- Point out the ModeBadge (global mode indicator) and SourceIndicator (per-component data origin). Explain the transparency model.

12. **Swagger API docs** -- Open `/api/docs`. Show that every endpoint is documented and testable.

---

## Customer-Facing FAQ

### What does SAP Spektra monitor?

SAP systems (S/4HANA, ECC, BW, PO, CRM, etc.), their hosts (CPU, RAM, disk), databases (HANA, Oracle, DB2), and operational metrics. The platform provides a unified view across your entire SAP landscape.

### Do I need to install anything?

Yes, a lightweight Python agent on each SAP host. The agent collects metrics and sends them securely to the Spektra platform. For SAP RISE systems, we connect via SAP Cloud Connector instead -- no local install required.

### What data leaves my network?

Only metrics, health status, and operational metadata. No business data, no SAP table contents, no credentials. All communication is encrypted in transit (TLS 1.2+).

### Is my data isolated?

Yes. SAP Spektra is multi-tenant with organization-level isolation enforced on every database query. Your data is never visible to other tenants. Each organization has its own authentication context and data partition.

### Can I automate operations?

Yes. Spektra includes 119 pre-built runbooks for SAP, database, and OS operations. Execution of critical actions requires approval, which can be configured per runbook and per environment. Dry-run mode is available for all runbooks.

### What if the platform is unavailable?

The agent stores metrics locally and resends them when connectivity restores. Your SAP systems are never affected by Spektra availability -- the agent is a passive observer and does not modify your SAP systems.

### What about SAP RISE?

We support RISE environments via Cloud Connector with SAP-level monitoring (system health, ABAP metrics, database status). OS-level metrics and host-level runbooks are not available for RISE systems because the hyperscaler infrastructure is managed by SAP. This limitation is clearly indicated in the UI for each affected system.

### What happens after the pilot?

At the end of the pilot period, you can continue with a paid Professional subscription ($999/mo) or cancel with no obligation. We will provide a summary report of findings and recommendations from the pilot.

### How is pricing structured?

Three tiers: Starter ($299/mo, 3 systems), Professional ($999/mo, 15 systems), Enterprise ($2,499/mo, unlimited). Add-ons available for additional systems, hosts, HA/DR, and evidence retention.

### Who has access to my tenant?

Only users you explicitly invite. The Maveram support team can access your tenant for troubleshooting purposes during the pilot, with your permission. All access is logged.

---

## Pilot Readiness Checklist

Complete all items before engaging the first pilot customer.

### Infrastructure

- [ ] AWS account provisioned (Maveram account)
- [ ] Terraform applied (VPC, RDS, ECS, CloudFront, Cognito)
- [ ] Domain configured (spektra.maveram.com)
- [ ] SSL certificate provisioned and attached
- [ ] Stripe account configured (products, prices, webhook endpoint)
- [ ] Seed data loaded (plans, sample runbooks, default configurations)

### Customer Preparation

- [ ] Pilot customer identified
- [ ] Customer landscape inventory received (SIDs, products, OS, DB)
- [ ] Agent packages built for customer OS (Linux distributions)
- [ ] Cloud Connector profiles prepared (if RISE systems present)

### Operations

- [ ] Support channel established (Slack or Teams)
- [ ] Weekly review cadence agreed with customer
- [ ] Pilot success criteria defined (quantitative and qualitative)
- [ ] Exit criteria defined (what triggers early termination)
- [ ] Escalation path documented and communicated to team
- [ ] Monitoring dashboards configured (CloudWatch, RDS metrics)

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Agent installation fails on customer OS | Medium | High | Pre-validate on matching OS image; have fallback SSH support ready; maintain compatibility matrix |
| Customer expects MFA | Low | Medium | Explain timeline; offer strong password policy + API key rotation as interim measure |
| Stripe webhook issues | Low | High | Monitor webhook logs in Stripe dashboard; manual subscription activation as fallback |
| Cloud Connector latency | Medium | Medium | Set expectations upfront; document limitations clearly; provide latency benchmarks |
| Customer has >15 systems | Low | Medium | Upgrade to Enterprise tier or apply custom limit override |
| Database performance under load | Low | High | Monitor RDS metrics; pre-provision adequate instance size; scale vertically if needed |
| Agent loses connectivity | Medium | Low | Agent stores locally and retries; alert on missed heartbeats; reconnection is automatic |
| Customer security review delays onboarding | Medium | Medium | Provide security documentation upfront; schedule review early in the process |
| Pilot customer disengages | Low | High | Weekly check-ins to maintain momentum; clear success metrics to show value early |
