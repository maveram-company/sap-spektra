# SAP Spektra — Implementation Decision Pack

Basado en SAAS_PRODUCT_MODEL.md (aprobado 2026-03-18).

---

## 1. DECISION REGISTER

| ID | Decision | Rationale | Impacto | Estado |
|----|----------|-----------|---------|--------|
| D01 | SaaS centralizado con edge agents | Control total de infra, multi-tenancy logica, agente para observabilidad profunda | Arquitectura core | Approved |
| D02 | 1 agente por host (no por sistema ni landscape) | La unidad de observabilidad es el servidor; un host puede tener multiples instancias SAP | Agent model, pricing | Approved |
| D03 | 4 connectivity profiles: AGENT, CLOUD_CONNECTOR, API_ONLY, NONE | Ortogonal a operational mode; determina capacidades disponibles | Capability engine, UX | Approved |
| D04 | Pricing por sistema SAP monitoreado | Se alinea con valor percibido, costo real y comprension del cliente | Billing, packaging | Approved |
| D05 | 3 tiers: Starter ($299), Professional ($999), Enterprise ($2,499) | Cubre SMB → Enterprise; comparable con mercado SAP ops | Pricing page, Stripe | Needs validation |
| D06 | Cloud Connector sin metricas OS, sin runbooks host-level, sin failover fisico | RISE no expone capa de infraestructura; prometer lo contrario seria engano | Capability matrix, UX, docs | Approved |
| D07 | AWS como unica cloud para hosting del SaaS | Terraform ya existe, ECS/RDS/Cognito son target | Infra, ops | Approved |
| D08 | Cognito para auth en produccion (JWT local para dev/test) | Managed identity, MFA, federation, email verification | Auth refactor | Approved |
| D09 | Stripe para billing (no AWS Marketplace en v1) | Marketplace tiene overhead operativo alto; Stripe es directo | Billing pipeline | Approved |
| D10 | Multi-tenancy logica (shared DB, org_id filter) | Ya implementado, escalable hasta ~10K tenants sin sharding | Schema, queries | Approved |
| D11 | Operational Mode y Connectivity Profile son dimensiones ortogonales | No mezclar; capability engine resuelve combinacion | Capability engine | Approved |
| D12 | Evidence retention como add-on (>90 dias cobra) | Storage crece linealmente; precio justo por volumen | S3 storage cost | Needs validation |
| D13 | RISE tier +20% sobre base | Overhead operativo de CC, soporte diferenciado | Pricing | Needs validation |
| D14 | Agent se autentica via API key del tenant | Ya implementado (sk-spektra-xxx); debe agregar TLS | Agent security | Approved |
| D15 | Add-on por host adicional ($29-49/mes) | Cubre costo de metricas + storage por host | Pricing | Needs validation |
| D16 | Trial period antes de billing (14 o 30 dias) | Reduce friccion de adquisicion | Onboarding, billing | Needs validation |
| D17 | AWS Marketplace diferido a post-10 clientes pagando | Complejidad de listado no justificada sin traccion | GTM | Approved |

---

## 2. OPEN QUESTIONS TO VALIDATE

| # | Pregunta | Impacto si no se valida | Propuesta de validacion |
|---|----------|------------------------|------------------------|
| Q1 | Costo AWS real por tenant/mes con carga tipica | Pricing puede ser insostenible o excesivamente conservador | Deploy staging, simular 5 tenants con 10 hosts cada uno, medir costo 30 dias |
| Q2 | Costo por host/agente en terminos de storage y compute | Add-on pricing ($29-49) puede no cubrir costo real | Medir: metricas/dia por host × 30 dias × costo RDS storage |
| Q3 | Precios finales de tiers | $299/$999/$2,499 son estimados, no validados con mercado | Benchmark contra competidores (Avantra, Syslink Xandria, IT-Conductor) |
| Q4 | Duracion de trial | 14 vs 30 dias afecta conversion y costo | Empezar con 14 dias, medir conversion, ajustar |
| Q5 | Alcance real de SAP Cloud Connector para Spektra | Latencia, fiabilidad, APIs disponibles via CC | PoC con cliente RISE real, documentar limitaciones |
| Q6 | Cognito migration: dual-mode o cutover? | Dual-mode es mas seguro pero mas complejo | Implementar dual-mode, deprecar JWT local en 90 dias post-launch |
| Q7 | Stripe billing edge cases | Impago, downgrades mid-cycle, refunds, multi-currency | Definir politicas antes de implementar webhooks |
| Q8 | Enforcement granularity | Bloquear creacion de sistema #4 en Starter o solo warning? | Hard block con mensaje claro + upgrade CTA |
| Q9 | Agent auto-update mechanism | Agentes desactualizados pueden romper compatibilidad | Evaluar: push update vs check-on-heartbeat |
| Q10 | Data residency para EU | GDPR puede requerir RDS en eu-west-1 | Diferir a Phase 2 salvo que primer cliente sea EU |

---

## 3. EPICS Y FEATURES

### EPIC 1 — SaaS Foundations (Phase 1, 4-6 weeks) — STATUS: DONE

| Feature | Historia tecnica | Criterio de aceptacion | Dependencia |
|---------|-----------------|----------------------|-------------|
| F1.1 ECS Deployment | Deploy API en ECS Fargate con ALB + TLS | API accesible via HTTPS en dominio custom | Cuenta AWS, dominio |
| F1.2 Frontend CDN | Deploy React en S3 + CloudFront | Frontend carga en <2s globalmente | F1.1 (API URL) |
| F1.3 RDS Production | RDS Multi-AZ con encryption at rest | Datos encriptados, failover automatico | Cuenta AWS |
| F1.4 ElastiCache Cluster | Redis con replicacion | Cache funcional, no single-point-of-failure | VPC |
| F1.5 Cognito Integration | Reemplazar JWT local con Cognito | Login/register via Cognito, MFA opcional | F1.1 |
| F1.6 Secrets Manager | Migrar JWT_SECRET, DB creds a Secrets Manager | Cero secretos en env vars o codigo | Cuenta AWS |
| F1.7 TLS Everywhere | HTTPS para API, agent communication, frontend | Cero HTTP en produccion | F1.1, certificados |
| F1.8 CI/CD Pipeline | GitHub Actions deploy a ECS, invalidar CloudFront | Push to main → deploy en 10 min | F1.1, F1.2 |

### EPIC 2 — Tenant & Subscription (Phase 2, 3-4 weeks) — STATUS: DONE

| Feature | Historia tecnica | Criterio de aceptacion | Dependencia |
|---------|-----------------|----------------------|-------------|
| F2.1 Signup Flow | Formulario publico → Cognito signup → tenant creation | Usuario nuevo puede registrarse y crear org | F1.5 |
| F2.2 Email Verification | Cognito email verification | Solo emails verificados acceden | F1.5 |
| F2.3 Plan Selection | UI de seleccion de plan durante signup | Cliente elige Starter/Professional/Enterprise | F2.1 |
| F2.4 Stripe Integration | Stripe Customer + Subscription creation | Pago procesado, subscription activa | Cuenta Stripe |
| F2.5 Plan Enforcement | QuotaGuard en endpoints criticos | Sistema #4 bloqueado en Starter con mensaje claro | F2.3 |
| F2.6 Invitation Workflow | Admin invita usuarios por email | Invitado recibe email, crea cuenta, se une al tenant | F1.5, F2.1 |
| F2.7 Trial Period | 14 dias sin cobro, luego billing activo | Trial expira → prompt de pago o downgrade a Starter | F2.4 |
| F2.8 Usage Metering | Track sistemas, usuarios, API calls por org | Dashboard de uso visible para admin del tenant | F2.5 |

### EPIC 3 — Agent Onboarding (Phase 3, 3-4 weeks) — STATUS: DONE

| Feature | Historia tecnica | Criterio de aceptacion | Dependencia |
|---------|-----------------|----------------------|-------------|
| F3.1 Agent Download Portal | S3-hosted binaries por OS (SLES, RHEL, Windows) | Download link funcional por plataforma | S3 |
| F3.2 Agent Registration | API endpoint para registrar agente con API key | Agente registrado, heartbeat visible en dashboard | F1.7 |
| F3.3 Agent TLS | HTTPS obligatorio para agent → API | Comunicacion encriptada, cert validation | F1.7 |
| F3.4 Install Wizard | Script de instalacion guiado (curl one-liner) | Instalacion en <5 min en Linux, <10 en Windows | F3.1 |
| F3.5 Connectivity Validation | Health check post-install que verifica metricas | "Agent connected" visible en UI | F3.2 |
| F3.6 Agent Version Registry | Tabla de versiones + compatibilidad | API rechaza agentes con version incompatible | F3.1 |
| F3.7 Heartbeat Dashboard | Vista admin de salud de agentes por sistema | Administrador ve: connected/degraded/disconnected | F3.2 |

### EPIC 4 — Cloud Connector / RISE (Phase 4, 2-3 weeks) — STATUS: DONE

| Feature | Historia tecnica | Criterio de aceptacion | Dependencia |
|---------|-----------------|----------------------|-------------|
| F4.1 ConnectivityProfile Model | Campo System.connectivityProfile en schema | Cada sistema tiene perfil explicito | Schema migration |
| F4.2 Capability Engine Extension | resolveCapabilities incluye connectivityProfile | Capabilities reducidas para CC visibles en UI | F4.1 |
| F4.3 RISE Onboarding Flow | Wizard para configurar CC: endpoint, credenciales, test | Cliente RISE conectado via CC | F4.1 |
| F4.4 RISE Limitation Badges | UI muestra limitaciones explicitas para sistemas RISE | Usuario sabe que OS metrics no estan disponibles | F4.2 |
| F4.5 CC Health Monitoring | Latency + availability tracking para CC tunnel | Degradacion visible cuando CC es lento | F4.3 |

### EPIC 5 — Pricing & Billing Live (Phase 5, 2-3 weeks) — STATUS: DONE

| Feature | Historia tecnica | Criterio de aceptacion | Dependencia |
|---------|-----------------|----------------------|-------------|
| F5.1 Invoice Generation | Stripe invoice mensual automatico | Cliente recibe invoice por email | F2.4 |
| F5.2 Payment Webhooks | Stripe webhook → actualizar subscription status | Impago suspende tenant en 7 dias | F2.4 |
| F5.3 Upgrade/Downgrade | UI + API para cambiar plan | Prorating correcto, cambio inmediato | F2.4, F2.5 |
| F5.4 Dunning Flow | Emails de aviso pre/post impago | 3 avisos antes de suspension | F5.2 |
| F5.5 Usage Dashboard | Pagina admin con uso actual vs limites | Admin ve cuanto ha usado y cuanto le queda | F2.8 |

### EPIC 6 — Documentation & GTM (Phase 6, 2 weeks) — STATUS: IN PROGRESS

| Feature | Historia tecnica | Criterio de aceptacion | Dependencia |
|---------|-----------------|----------------------|-------------|
| F6.1 Pricing Page Publica | HTML responsive con tiers y CTA | Visitante entiende pricing sin login | Pricing final |
| F6.2 Onboarding Docs | Guias por perfil: agent, CC, API_ONLY | Cliente puede onboardear sin soporte | F3, F4 |
| F6.3 Agent Installation Docs | Guias por OS: SLES, RHEL, Windows | Instalacion exitosa siguiendo la guia | F3.4 |
| F6.4 RISE Limitations Page | Pagina publica explicando que incluye y que no CC | Cliente RISE sabe exactamente que esperar | F4.4 |
| F6.5 Updated Architecture Docs | Regenerar docs HTML para modelo SaaS | Documentacion refleja deployment real | F1-F5 |

---

## 4. AWS IMPLEMENTATION BACKLOG

| Componente | Accion | Prioridad | Estimacion |
|-----------|--------|-----------|-----------|
| CloudFront + S3 | Bucket para frontend, distribution con custom domain, HTTPS | P0 | 2 dias |
| ECS Fargate | Task definition, service, ALB, auto-scaling rules | P0 | 3 dias |
| RDS PostgreSQL | Multi-AZ, encryption, parameter group, backup policy | P0 | 2 dias |
| ElastiCache Redis | Cluster mode, encryption in transit, auth token | P0 | 1 dia |
| Cognito | User pool, app client, custom domain, email templates | P0 | 3 dias |
| Secrets Manager | JWT key, DB creds, Stripe keys, agent signing key | P0 | 1 dia |
| S3 (storage) | Evidence bucket, agent artifacts bucket, lifecycle rules | P1 | 1 dia |
| SQS | Metrics ingestion queue, billing events queue | P1 | 1 dia |
| EventBridge | Agent events, billing events, audit events | P1 | 1 dia |
| CloudWatch | Log groups, metrics, alarms, dashboards | P1 | 2 dias |
| X-Ray | Tracing para API requests | P2 | 1 dia |
| WAF | Rate limiting, geo-blocking, SQL injection rules | P2 | 1 dia |
| Route53 | Custom domain, health checks | P0 | 0.5 dia |
| ACM | TLS certificates | P0 | 0.5 dia |
| Stripe | Customer portal, webhook endpoint, product/price config | P1 | 3 dias |

---

## 5. PRODUCT BACKLOG

| Feature | Prioridad | Estimacion | Fase |
|---------|-----------|-----------|------|
| Cognito auth (replace JWT local) | P0 | 5 dias | 1 |
| Signup flow publico | P0 | 3 dias | 2 |
| Tenant creation automatica | P0 | 2 dias | 2 |
| Plan selection UI | P0 | 2 dias | 2 |
| Stripe subscription creation | P0 | 3 dias | 2 |
| Plan enforcement (QuotaGuard) | P0 | 3 dias | 2 |
| Email verification (Cognito) | P0 | 1 dia | 2 |
| Agent download portal | P1 | 2 dias | 3 |
| Agent registration API | P1 | 2 dias | 3 |
| Agent install wizard script | P1 | 3 dias | 3 |
| Connectivity validation | P1 | 2 dias | 3 |
| System.connectivityProfile field | P1 | 1 dia | 4 |
| Capability engine + connectivity | P1 | 3 dias | 4 |
| CC onboarding wizard | P1 | 3 dias | 4 |
| RISE limitation badges | P1 | 2 dias | 4 |
| Invitation workflow | P1 | 2 dias | 2 |
| Usage metering service | P1 | 3 dias | 2 |
| Invoice generation (Stripe) | P1 | 2 dias | 5 |
| Payment webhooks | P1 | 2 dias | 5 |
| Upgrade/downgrade flow | P1 | 2 dias | 5 |
| Usage dashboard | P2 | 3 dias | 5 |
| Dunning flow | P2 | 2 dias | 5 |
| Multi-org session switching | P2 | 3 dias | 2 |
| Agent version registry | P2 | 2 dias | 3 |
| Billing page enhanced | P2 | 2 dias | 5 |

---

## 6. DOCUMENTATION IMPACT

| Documento | Seccion a cambiar | Motivo |
|-----------|-------------------|--------|
| `index.html` | Product overview, KPIs | Agregar SaaS deployment model, connectivity profiles |
| `architecture.html` | System diagram, deployment | Reemplazar local-only con AWS architecture |
| `multi-mode.html` | Capability engine | Agregar dimension connectivityProfile |
| `domains.html` | Coverage matrix | Agregar columna connectivity profile |
| `getting-started.html` | Setup, env vars | Agregar cloud deployment, Cognito config |
| `validation.html` | Test counts | Actualizar cuando se agreguen tests de SaaS features |
| `backlog.html` | Backlog items | Reemplazar con SaaS implementation roadmap |
| `executive.html` | Status, metrics | Actualizar estado de madurez SaaS |
| `MULTI_MODE_ARCHITECTURE.md` | Capability engine | Agregar connectivity profile dimension |
| `SAAS_PRODUCT_MODEL.md` | (nuevo) | Ya creado |
| `README.md` | Quick start | Agregar cloud deployment option |
| `ARCHITECTURE.md` | Deployment model | Agregar AWS SaaS architecture |

---

## 7. GO-TO-MARKET PACK

### Product Statement
SAP Spektra es la plataforma SaaS de operaciones para landscapes SAP. Monitorea, automatiza y gobierna sistemas SAP en cualquier infraestructura — on-premise, cloud privada, publica o SAP RISE — desde un unico panel con observabilidad profunda, runbooks automatizados y gobernanza multi-modo.

### What Customer Buys
Una suscripcion mensual por sistemas SAP monitoreados. Incluye: dashboard operativo, alertas, runbooks, approvals, analytics, evidencia y auditoria. Add-ons disponibles para HA/DR, hosts adicionales y retencion extendida.

### What Customer Installs
- **Con agente (recomendado):** 1 proceso Python por host SAP. Instalacion en <5 min. Observabilidad completa de OS + SAP + DB.
- **Sin agente (RISE/restringido):** Conexion via SAP Cloud Connector. Observabilidad limitada a capa SAP. Sin metricas OS ni runbooks host-level.
- **Sin conexion (PoC):** Registro manual de sistemas. Solo governance y analytics basicos.

### What Runs in AWS (Maveram)
Frontend, API, base de datos, cache, auth, billing, evidencia, analytics, colas y observabilidad. El cliente no necesita infraestructura AWS propia.

### Pricing Summary
| Tier | Sistemas | Usuarios | Precio |
|------|----------|----------|--------|
| Starter | 3 | 5 | $299/mes |
| Professional | 15 | 25 | $999/mes |
| Enterprise | Ilimitado | Ilimitado | $2,499/mes |

Add-ons: sistema adicional ($49-99/mes), host adicional ($29-49/mes), HA/DR pack ($299/mes/landscape), retencion extendida ($0.50/GB/mes).

### RISE Model
Conectividad via SAP Cloud Connector. Incluye monitoring SAP-level, alertas, approvals, analytics y governance. No incluye: metricas de OS, runbooks host-level, failover fisico, evidencia local avanzada. Precio: +20% sobre tier base.

---

## 8. FINAL RECOMMENDATION

### Ejecutar ya
- **Phase 1 (SaaS Foundations):** Deploy en AWS (ECS, RDS, CloudFront, Cognito, Secrets Manager). Todo lo necesario ya esta en Terraform. Estimacion: 4-6 semanas.
- **Validar Q1-Q3** en paralelo: costo por tenant, pricing competitivo, Cloud Connector PoC.

### Requiere validacion previa
- **Pricing final (Q3):** Benchmark antes de publicar pricing page.
- **Trial duration (Q4):** Definir 14 vs 30 dias basado en complejidad de onboarding.
- **Cognito strategy (Q6):** Confirmar dual-mode antes de implementar.
- **Stripe edge cases (Q7):** Definir politicas de impago, refund, multi-currency.

### NO implementar todavia
- **AWS Marketplace (D17):** Diferir hasta tener 10+ clientes pagando.
- **Data residency (Q10):** Diferir a Phase 2 salvo requerimiento explicito de primer cliente EU.
- **SSO federation:** Enterprise tier feature, implementar cuando haya demanda.
- **Agent auto-update push:** Evaluar post-Phase 3; empezar con check-on-heartbeat.

### Current status
**Phases 1-5 COMPLETE.** Phase 6 (Documentation & GTM) is in progress. All SaaS foundations, billing, agents, cloud connector, and pricing are implemented. The platform has 26 modules, 95+ endpoints, 32 Prisma models, and 1,510 tests.
