# SAP Spektra -- Pilot Dry-Run Checklist

Simulate the full first-customer experience end-to-end before engaging a real pilot customer. Every step should pass cleanly. Document any issues encountered and resolve them before proceeding.

---

## Pre-flight

- [ ] App running (API + Frontend) -- both accessible and healthy
- [ ] Database seeded (`npx prisma db seed` completed without errors)
- [ ] Stripe configured (test mode acceptable for dry-run)
- [ ] Agent package available (correct OS/arch for test host)

---

## 1. Tenant Bootstrap

- [ ] Register new org via `POST /auth/register` with email, password, and org name
- [ ] Verify response includes `accessToken`, `refreshToken`, and `user` object
- [ ] Verify trial subscription created: `GET /billing/subscription` returns `status: trialing`
- [ ] Verify org appears in `GET /tenant` with correct name and configuration

**Expected result:** New tenant is fully operational with trial subscription within seconds of registration.

---

## 2. Subscription Activation

- [ ] (If Stripe configured) Call `POST /billing/subscribe` with Professional plan
- [ ] Verify subscription status changes to `active` via `GET /billing/subscription`
- [ ] Verify plan limits enforced: create systems up to the plan limit (15), then verify that creating one more is blocked with an appropriate error

**Expected result:** Subscription transitions from trialing to active. Quota enforcement prevents exceeding plan limits.

---

## 3. Invite User

- [ ] `POST /invitations` with a team member email address
- [ ] Verify invitation appears in `GET /invitations` with pending status
- [ ] Accept invitation via `POST /invitations/accept` with the invitation token
- [ ] Verify the new user can login with their credentials and access the tenant

**Expected result:** Invitation flow works end-to-end. New user has correct role and tenant association.

---

## 4. System Registration

- [ ] `POST /systems` to create an SAP system (provide SID, product, environment, database type)
- [ ] Verify system appears in `GET /systems` with correct attributes
- [ ] Verify system appears on the dashboard (system card rendered with status)

**Expected result:** System is created, queryable via API, and visible in the frontend dashboard.

---

## 5. Agent Onboarding

- [ ] Create API key via `POST /settings/api-keys` -- note the returned key value
- [ ] `POST /agents/register` with systemId, hostId, version, and API key in header
- [ ] Verify agent appears in `GET /agents` with status `registered`
- [ ] `POST /agents/heartbeat` with the agent ID
- [ ] Verify agent status transitions to `connected`

**Expected result:** Agent registers, heartbeat is accepted, and status reflects live connectivity.

---

## 6. Cloud Connector Onboarding

- [ ] `POST /cloud-connector/configure` with locationId, virtualHost, and port for a RISE system
- [ ] `POST /cloud-connector/:systemId/test` to validate the configuration
- [ ] Verify response: `configurationValid = true`, `connectivityVerified = false` (expected -- no real SAP system behind it in dry-run)
- [ ] `GET /cloud-connector/:systemId/limitations` -- verify correct limitation data returned (OS metrics unavailable, host runbooks unavailable)

**Expected result:** Cloud Connector configuration is stored and validated. Limitations are correctly reported.

---

## 7. Smoke Tests

Verify all major frontend pages load and function correctly.

- [ ] **Dashboard** loads with system data (system cards, KPIs, health gauges)
- [ ] **Alerts** page shows alerts with filtering and lifecycle actions
- [ ] **Runbooks** page lists 119 runbooks across SAP, database, and OS categories
- [ ] **Approvals** page shows approval requests with status indicators
- [ ] **HA Control** page shows HA configurations and readiness status
- [ ] **Analytics** page loads overview with trend charts and execution stats
- [ ] **Connectors** page shows connector status for registered systems
- [ ] **Swagger docs** accessible at `/api/docs` with all endpoints documented

**Expected result:** All pages render without errors. Data is consistent with what was created in prior steps.

---

## 8. Evidence Validation

Verify the multi-mode transparency system is working correctly.

- [ ] **ModeBadge** visible on pages -- displays the current operational mode (e.g., `demo`, `live`)
- [ ] **SourceIndicator** shows data source metadata on components (provider, mode, timestamp)
- [ ] **EvidencePanel** expandable on runbooks, approvals, and HA pages -- shows full provenance trail

**Expected result:** Every data-bearing component carries transparent metadata about its source and mode.

---

## 9. Billing Validation

- [ ] `GET /billing/subscription` shows active subscription with correct plan details
- [ ] `GET /billing/usage` shows current period usage (system count, user count, host count)
- [ ] Plan limits enforced: attempt to exceed system count and verify the request is rejected
- [ ] `GET /plans` shows all three tiers with correct pricing ($299, $999, $2,499)

**Expected result:** Billing state is accurate. Quotas are enforced. Plan catalog matches pricing sheet.

---

## 10. Sign-off

- [ ] All smoke tests pass (sections 1-9 above)
- [ ] No 500 errors in API logs during the entire dry-run
- [ ] No console errors in frontend during the entire dry-run
- [ ] All issues encountered during dry-run documented with severity and resolution
- [ ] **Decision: GO / NO-GO for pilot customer**

### Sign-off Record

| Item | Result |
|------|--------|
| Date | |
| Performed by | |
| Environment | |
| Total issues found | |
| Critical issues | |
| Decision | GO / NO-GO |
| Notes | |
