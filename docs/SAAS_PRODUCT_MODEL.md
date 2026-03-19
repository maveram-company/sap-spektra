# SAP Spektra — SaaS Product Model Decision Document

## 1. Executive Summary

SAP Spektra es un SaaS centralizado con edge agents, desplegado en la cuenta AWS del operador (Maveram), con multi-tenancy logica a nivel de base de datos. Los clientes acceden via browser al frontend hospedado en CloudFront/S3 y consumen la API en ECS Fargate. La observabilidad profunda de sistemas SAP requiere un agente local por host; los clientes SAP RISE usan Cloud Connector con capacidades reducidas y explicitamente documentadas.

El modelo se sostiene sobre dos dimensiones ortogonales:
- **Operational Mode** (REAL/FALLBACK/MOCK/RESTRICTED) — ya implementado
- **Connectivity Profile** (AGENT/CLOUD_CONNECTOR/API_ONLY/NONE) — por implementar

---

## 2. Recommended Product Model

**Tipo: SaaS centralizado con edge agents.**

| Componente | Ubicacion | Justificacion |
|-----------|-----------|---------------|
| Frontend (React 19) | AWS CloudFront + S3 | CDN global, sin servidor |
| Backend API (NestJS 11) | AWS ECS Fargate | Serverless containers, auto-scaling |
| Base de datos (PostgreSQL 16) | AWS RDS Multi-AZ | Durabilidad, backups automaticos |
| Cache (Redis 7) | AWS ElastiCache | Session cache, rate limiting |
| Auth/Identity | AWS Cognito | Managed identity, MFA, federation |
| Object Storage | AWS S3 | Evidence packs, agent artifacts, exports |
| Colas/Eventos | AWS SQS + EventBridge | Async processing, billing events, agent commands |
| Observabilidad | AWS CloudWatch + X-Ray | Logs, metrics, traces |
| Secretos | AWS Secrets Manager | JWT keys, DB creds, API keys |
| Tenant Management | Backend API + RDS | Organization model existente |
| Subscription/Billing | Stripe + webhook pipeline | Invoices, payment, plan enforcement |
| Agent Management | Backend API + S3 | Registration, artifacts, versioning |
| Telemetria | Backend API + SQS buffer | Metrics ingestion pipeline |
| CI/CD | GitHub Actions | Ya configurado |

**Agente:** Se instala 1 por host/servidor del cliente. Es un proceso Python ligero que:
- Observa: metricas OS, SAP (sapcontrol), DB (HANA/Oracle/DB2/MSSQL/ASE/MaxDB), topologia
- Ejecuta: comandos de runbooks, pasos de failover, validaciones
- Reporta: heartbeat cada 60s, metricas cada 60s, evidencia de ejecucion
- Se autentica: via API key emitida por el tenant

**Cloud Connector (RISE):** SAP Cloud Connector provee tunel seguro entre SAP BTP y sistemas RISE. Spektra lo usa como proxy para:
- Lectura de metricas SAP (via RFC/API)
- Inventario de instancias SAP
- NO: metricas de SO, runbooks host-level, evidencia local, failover fisico

---

## 3. Connectivity Profiles

### AGENT
- Instalado en cada host del cliente
- Acceso completo: OS + SAP + DB + topologia
- Ejecucion de runbooks host-level y SAP-level
- Evidencia local avanzada
- HA readiness y failover fisico
- Recomendaciones basadas en OS y SAP

### CLOUD_CONNECTOR
- Sin agente local
- Acceso limitado: solo SAP application layer via RFC/API
- Sin metricas de OS
- Sin runbooks host-level
- Sin evidencia local
- Sin failover fisico
- Sin recomendaciones de OS
- Valido para RISE y entornos restringidos

### API_ONLY
- Sin agente ni Cloud Connector
- Solo funcionalidad basada en datos ingresados manualmente o importados
- Analytics y governance sin observabilidad real-time
- Util para PoC o onboarding pre-agent

### NONE
- Tenant registrado sin sistemas conectados
- Solo acceso a configuracion, planes y documentacion
- Estado inicial post-registro

---

## 4. Capability Matrix

| Capacidad | AGENT | CLOUD_CONNECTOR | API_ONLY | NONE |
|-----------|:-----:|:---------------:|:--------:|:----:|
| Inventario SAP | Si | Si | Manual | No |
| Inventario host | Si | No | No | No |
| Metricas OS (CPU/RAM/disk) | Si | No | No | No |
| Metricas SAP (sapcontrol) | Si | Parcial | No | No |
| Metricas DB | Si | No | No | No |
| Runbooks funcionales (SAP) | Si | Parcial | No | No |
| Runbooks host-level (OS) | Si | No | No | No |
| HA readiness assessment | Si | Parcial | No | No |
| Failover/failback fisico | Si | No | No | No |
| Evidencia local avanzada | Si | No | No | No |
| Approvals | Si | Si | Si | No |
| Analytics | Si | Parcial | Parcial | No |
| Chat/Copilot | Si | Si | Si | No |
| Recomendaciones OS | Si | No | No | No |
| Recomendaciones SAP | Si | Si | Limitado | No |
| Auditoria/evidence | Si | Parcial | Parcial | No |
| Compliance/reporting | Si | Parcial | Parcial | No |

---

## 5. Operational Mode x Connectivity Profile

| Combinacion | Comportamiento |
|------------|---------------|
| REAL + AGENT | Plena funcionalidad, efecto operativo real |
| REAL + CLOUD_CONNECTOR | Funcionalidad SAP-level real, sin OS-level |
| REAL + API_ONLY | Solo operaciones manuales/importadas |
| FALLBACK + AGENT | Intenta real, degrada a cache si el agente no responde |
| FALLBACK + CLOUD_CONNECTOR | Intenta real via CC, degrada si BTP no responde |
| MOCK + cualquiera | Simulacion completa, sin conexion real |
| RESTRICTED + cualquiera | Lectura limitada, escritura bloqueada |

---

## 6. Impacto en Capability Engine

El capability engine actual resuelve por (mode, backendReachable). Debe extenderse a:

```
resolveCapabilities(mode, backendReachable, connectivityProfile, systemCapabilities)
```

Donde:
- `connectivityProfile` determina que providers y acciones estan disponibles
- `systemCapabilities` (del modelo System en BD) indica que soporta cada sistema especifico
- La resolucion es por DOMINIO x SISTEMA, no solo por dominio global

---

## 7. Customer Registration Flow

1. **Signup** → email + password + company name + plan selection
2. **Email verification** → Cognito sends verification link
3. **Tenant creation** → Organization created with selected plan
4. **Admin setup** → First user gets admin role
5. **Onboarding wizard** →
   a. Register landscapes/systems (SID, product, environment)
   b. Define connectivity profile per system
   c. If AGENT: download + install agent, validate heartbeat
   d. If CLOUD_CONNECTOR: configure BTP tunnel, validate connectivity
   e. If API_ONLY: manual system registration
6. **Capability validation** → System shows available capabilities per profile
7. **Activation** → Tenant fully operational

---

## 8. Pricing Driver Model

### Unidad de valor recomendada: SISTEMA SAP MONITOREADO

**Justificacion:**
- Es la unidad que el cliente entiende (cada SID)
- Se alinea con el valor entregado (monitoring + automation por sistema)
- Es facil de contar y verificar
- Se alinea con costo (mas sistemas = mas metricas = mas storage)

### Packaging propuesto

| Tier | Base | Incluye | Precio sugerido |
|------|------|---------|----------------|
| **Starter** | 1 landscape (DEV+QAS+PRD) | 3 sistemas, 5 usuarios, monitoring basico, alertas, dashboard | $299/mes |
| **Professional** | Multi-landscape | 15 sistemas, 25 usuarios, runbooks, approvals, analytics, API | $999/mes |
| **Enterprise** | Ilimitado | Sistemas ilimitados, usuarios ilimitados, HA/DR, SSO, audit, custom connectors, SLA | $2,499/mes |

### Add-ons

| Add-on | Unidad | Precio sugerido |
|--------|--------|----------------|
| Sistema adicional | por sistema/mes | $49-99 |
| Host adicional (agente) | por host/mes | $29-49 |
| HA/DR pack | por landscape | $299/mes |
| Evidence retention (>90 dias) | por GB/mes | $0.50 |
| Managed service | por tenant | custom |
| RISE/Cloud Connector tier | por sistema | +20% sobre base |

### Modelos peligrosos a evitar
- **Por usuario:** Incentiva que el cliente use pocos usuarios, reduciendo adopcion
- **Por metrica/datapoint:** Impredecible, genera anxiety de consumo
- **Flat rate unico:** No escala con valor entregado
- **Por agente solo:** Desacopla el pricing del valor real (el valor es el sistema SAP, no el proceso del agente)

---

## 9. Implementation Status

> **All 6 phases are complete.** The SaaS model has been fully implemented across Phases 1-5, with Phase 6 (Documentation & GTM) in progress.

| Phase | Status | Key Deliverables |
|-------|--------|-----------------|
| Phase 1 — SaaS Foundations | **DONE** | Deploy workflow (`.github/workflows/deploy.yml`), Cognito dual-mode, `docker-compose.ci.yml` |
| Phase 2 — Tenant & Subscription | **DONE** | Stripe integration (fetch-based), QuotaGuard, invitations, Subscription + UsageRecord + Invitation models |
| Phase 3 — Agent Model | **DONE** | AgentRegistration model, 7 endpoints (register, heartbeat, list, summary, revoke, version check) |
| Phase 4 — Cloud Connector / RISE | **DONE** | System.connectivityProfile, CloudConnectorConfig model, RISELimitationBadge, 6 endpoints |
| Phase 5 — Pricing & Billing Live | **DONE** | Subscribe, upgrade, cancel, usage refresh, Stripe webhooks (`/webhooks/stripe`) |
| Phase 6 — Documentation & GTM | **IN PROGRESS** | All documentation updated to reflect SaaS model |

### Verified facts:
- Backend: 54 suites, 449 tests (was 49/392 before SaaS phases)
- Frontend: 86 suites, 1,061 tests
- Total: 1,510 tests
- New backend modules: billing, invitations, agents, cloud-connector
- New models: Subscription, UsageRecord, Invitation, AgentRegistration, CloudConnectorConfig
- REST endpoints: ~95+ (was 78, added +23)

## 10. Gap Analysis (Updated)

### Bloqueante para SaaS

| Gap | Estado actual | Requerido |
|-----|-------------|-----------|
| Cognito auth integration | **DONE** — Dual-mode: AWS_REAL uses Cognito, LOCAL_SIMULATED uses JWT | Full Cognito flow |
| Payment processing | **DONE** — Stripe fetch-based integration | Stripe integration |
| Plan enforcement | **DONE** — QuotaGuard with subscription status check | Quota guards on endpoints |
| Email verification | **DONE** — Cognito handles this in AWS_REAL mode | Cognito handles this |
| Agent TLS | HTTP only | HTTPS + cert pinning |
| Data encryption at rest | Not enabled | RDS encryption + S3 SSE |

### Importante para SaaS

| Gap | Estado actual | Requerido |
|-----|-------------|-----------|
| Connectivity Profile model | **DONE** — System.connectivityProfile field | System.connectivityProfile field |
| Capability engine extension | **DONE** — ConnectivityProfile type in frontend capability engine | Mode + connectivity + system caps |
| Usage metering | **DONE** — UsageRecord model + usage endpoints | Track systems/users/API calls |
| Multi-org session | Single org login | Org switcher |
| Invitation workflow | **DONE** — Create, accept, list, revoke | Email invitations |
| Agent versioning | **DONE** — Version check endpoint | Version registry + upgrade push |
| Metrics retention policy | Indefinite storage | TTL per plan tier |

### Opcional para v1

| Gap | Estado actual | Requerido |
|-----|-------------|-----------|
| AWS Marketplace | Not listed | List after 10+ paying customers |
| Field-level encryption | Not implemented | Phase 2 compliance |
| Data residency | No region locking | Phase 2 for EU customers |
| SSO federation | Not implemented | Enterprise tier feature |

---

## 11. Phased Implementation Roadmap

### Phase 1 — SaaS Foundations (4-6 weeks)
- **Objetivo:** Infraestructura productiva en AWS
- **Cambios:** Deploy API en ECS, frontend en CloudFront, RDS Multi-AZ, ElastiCache cluster, Cognito integration, Secrets Manager, TLS everywhere
- **Dependencia:** Cuenta AWS configurada, dominio registrado
- **Riesgo:** Cognito integration puede requerir refactor de auth flow
- **Criterio:** Login via Cognito funcional, API accesible via HTTPS, datos encriptados at rest

### Phase 2 — Tenant & Subscription (3-4 weeks)
- **Objetivo:** Registro, planes y billing funcional
- **Cambios:** Stripe integration, plan enforcement guards, email verification, invitation flow, onboarding wizard
- **Dependencia:** Phase 1 complete, Stripe account
- **Riesgo:** Plan enforcement puede romper flujos existentes si no se manejan graceful limits
- **Criterio:** Customer puede registrarse, elegir plan, pagar, y su tenant queda activo con limites

### Phase 3 — Agent Model (3-4 weeks)
- **Objetivo:** Agent onboarding productivo
- **Cambios:** Agent TLS, version registry, download portal, install wizard, connectivity validation, heartbeat dashboard
- **Dependencia:** Phase 1 (HTTPS), Phase 2 (tenant exists)
- **Riesgo:** Agent packaging para multiples OS (Linux SLES/RHEL, Windows)
- **Criterio:** Customer instala agente, valida heartbeat, ve metricas reales en dashboard

### Phase 4 — Cloud Connector / RISE (2-3 weeks)
- **Objetivo:** Conectividad RISE funcional con limitaciones explicitas
- **Cambios:** System.connectivityProfile field, capability engine extension, UI indicators for RISE limitations, Cloud Connector onboarding flow
- **Dependencia:** Phase 3 (capability model)
- **Riesgo:** Cloud Connector latency y disponibilidad depende de SAP BTP
- **Criterio:** Customer RISE conectado via CC, capabilities reducidas visibles, sin promesas de OS-level

### Phase 5 — Pricing & Billing Live (2-3 weeks)
- **Objetivo:** Facturacion real
- **Cambios:** Usage metering, invoice generation, payment webhooks, dunning flow, upgrade/downgrade
- **Dependencia:** Phase 2 (Stripe base)
- **Riesgo:** Metering incorrecto genera facturas erroneas
- **Criterio:** Invoice mensual automatico, cobro exitoso, metering verificable

### Phase 6 — Documentation & GTM (2 weeks)
- **Objetivo:** Documentacion actualizada y material comercial alineado
- **Cambios:** Regenerar docs HTML para SaaS model, pricing page publica, onboarding guides, agent installation docs, RISE limitations page
- **Dependencia:** Phases 1-5 complete
- **Riesgo:** Documentation drift si se implementa antes de cerrar features
- **Criterio:** Toda la documentacion refleja el producto SaaS real desplegado

---

## 12. Final Recommendation

SAP Spektra tiene una base arquitectonica solida para operar como SaaS. El multi-tenancy, RBAC, capability engine y modelo multi-modo ya estan implementados. Los gaps principales son de integracion AWS (Cognito, billing, encryption) y de modelo comercial (enforcement, metering, onboarding).

**Recomendacion:** Proceder con Phase 1 (SaaS Foundations) inmediatamente. Es la fase con mayor impacto y menor riesgo arquitectonico, ya que la infraestructura Terraform ya existe y el backend esta preparado para AWS_REAL mode.

**Timeline estimado total:** 16-22 semanas para SaaS productivo con billing.

**Riesgo principal:** La integracion de Cognito reemplazando JWT local es el cambio mas invasivo. Recomiendo un approach dual donde Cognito y JWT local coexistan durante la transicion.
