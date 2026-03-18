# SAP Spektra — Hardening Backlog

## Must-have next

### 1. Restricted providers para 8 dominios restantes
- **Prioridad:** Alta
- **Impacto:** Completa la semantica de RESTRICTED en todo el producto
- **Dependencia:** Ninguna
- **Estado actual:** systems, alerts, events, operations, analytics, admin, landscape, chat usan mock en modo RESTRICTED
- **Criterio de aceptacion:** Cada dominio tiene provider dedicado que bloquea escrituras con `{ blocked: true, reason }` y retorna lecturas con `source: 'restricted'`

### 2. EvidencePanel integrado en paginas
- **Prioridad:** Alta
- **Impacto:** Hace visible la trazabilidad de ProviderResult<T> para el usuario
- **Dependencia:** Ninguna (componente ya existe y esta testeado)
- **Estado actual:** EvidencePanel existe como componente reutilizable pero no esta conectado en ninguna pagina
- **Criterio de aceptacion:** Visible post-ejecucion en RunbooksPage, post-aprobacion en ApprovalsPage, post-failover en HAControlCenterPage

### 3. Playwright E2E en CI
- **Prioridad:** Alta
- **Impacto:** Validacion automatica de flujos multi-modo en browser real
- **Dependencia:** Requiere `docker-compose.ci.yml` para levantar backend en CI
- **Estado actual:** Tests existen en `e2e/multi-mode.spec.ts`, no corren en CI
- **Criterio de aceptacion:** Pipeline CI ejecuta E2E tests con reporte de artefactos

## Should-have

### 4. Capability context dinamico
- **Prioridad:** Media
- **Impacto:** Capabilities resueltas por tenant + tipo de sistema + estado de conector, no solo por modo global
- **Dependencia:** Backend debe exponer metadata de capability por sistema
- **Estado actual:** Resolucion estatica basada en modo + backend reachability
- **Criterio de aceptacion:** `getCapabilityContext({ tenantId, systemId, domain, action })` resuelve tier diferenciado

### 5. Approval engine real
- **Prioridad:** Media
- **Impacto:** Soporta dual-approval, SLA, escalamiento automatico, aprobacion basada en riesgo
- **Dependencia:** Backend approval module enhancement
- **Estado actual:** CRUD basico de aprobaciones
- **Criterio de aceptacion:** Approval workflow con SLA, escalamiento y dual-approval para operaciones criticas

### 6. Simulation engine mejorado
- **Prioridad:** Media
- **Impacto:** Mock mode con secuencias temporales, estados progresivos, errores aleatorios
- **Dependencia:** Ninguna
- **Estado actual:** Datos estaticos con delay simulado
- **Criterio de aceptacion:** Mock genera landscape sintetico realista con variabilidad controlada

### 7. Refresh token mechanism
- **Prioridad:** Media
- **Impacto:** Sesiones de larga duracion sin re-login
- **Dependencia:** Backend auth module
- **Estado actual:** JWT expira en 24h sin refresh
- **Criterio de aceptacion:** Token refresh transparente antes de expiracion

## Nice-to-have

### 8. ProviderResult en backend
- **Prioridad:** Baja
- **Impacto:** Trazabilidad end-to-end backend → frontend
- **Dependencia:** NestJS interceptor + DTO wrapper
- **Estado actual:** ProviderResult es frontend-only
- **Criterio de aceptacion:** API responses incluyen source/confidence metadata

### 9. Mode switching UI
- **Prioridad:** Baja
- **Impacto:** Cambio de modo desde la UI con confirmacion y audit
- **Dependencia:** Ninguna
- **Estado actual:** Solo via env var o localStorage
- **Criterio de aceptacion:** Dropdown en header con confirmacion modal

### 10. Capability dashboard
- **Prioridad:** Baja
- **Impacto:** Vista dedicada de estado de capabilities por dominio
- **Dependencia:** Capability context dinamico (#4)
- **Estado actual:** No existe
- **Criterio de aceptacion:** Pagina mostrando tier/degradaciones/restricciones por dominio

### 11. AWS SDK integration
- **Prioridad:** Baja (hasta que se necesite deploy AWS)
- **Impacto:** Modo AWS_REAL completo con Cognito, S3, SQS, EventBridge
- **Dependencia:** Terraform templates ya existen
- **Estado actual:** Templates Terraform, cero SDK en app code
- **Criterio de aceptacion:** Auth via Cognito, storage via S3, eventos via EventBridge en runtime
