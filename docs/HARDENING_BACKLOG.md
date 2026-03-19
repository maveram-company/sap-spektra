# SAP Spektra — Hardening Backlog

## Completed

### 1. Restricted providers para 12/12 dominios (DONE)
- **Prioridad:** Alta
- **Impacto:** Completa la semantica de RESTRICTED en todo el producto
- **Estado:** COMPLETADO — Los 12 dominios ahora tienen restricted providers dedicados que bloquean escrituras con `{ blocked: true, reason }` y retornan lecturas con `source: 'restricted'`

### 2. EvidencePanel integrado en paginas (DONE)
- **Prioridad:** Alta
- **Impacto:** Hace visible la trazabilidad de ProviderResult<T> para el usuario
- **Estado:** COMPLETADO — EvidencePanel integrado en RunbooksPage, ApprovalsPage, HAControlCenterPage

### 3. Playwright E2E en CI (DONE)
- **Prioridad:** Alta
- **Impacto:** Validacion automatica de flujos multi-modo en browser real
- **Estado:** COMPLETADO — Pipeline CI ejecuta E2E tests con `docker-compose.ci.yml` y script `test:e2e:ci`

## Must-have next

### 1. Capability context dinamico
- **Prioridad:** Media
- **Impacto:** Capabilities resueltas por tenant + tipo de sistema + estado de conector, no solo por modo global
- **Dependencia:** Backend debe exponer metadata de capability por sistema
- **Estado actual:** Resolucion estatica basada en modo + backend reachability
- **Criterio de aceptacion:** `getCapabilityContext({ tenantId, systemId, domain, action })` resuelve tier diferenciado

### 2. Approval engine real
- **Prioridad:** Media
- **Impacto:** Soporta dual-approval, SLA, escalamiento automatico, aprobacion basada en riesgo
- **Dependencia:** Backend approval module enhancement
- **Estado actual:** CRUD basico de aprobaciones
- **Criterio de aceptacion:** Approval workflow con SLA, escalamiento y dual-approval para operaciones criticas

### 3. Simulation engine mejorado
- **Prioridad:** Media
- **Impacto:** Mock mode con secuencias temporales, estados progresivos, errores aleatorios
- **Dependencia:** Ninguna
- **Estado actual:** Datos estaticos con delay simulado
- **Criterio de aceptacion:** Mock genera landscape sintetico realista con variabilidad controlada

### 4. Refresh token mechanism
- **Prioridad:** Media
- **Impacto:** Sesiones de larga duracion sin re-login
- **Dependencia:** Backend auth module
- **Estado actual:** JWT expira en 24h sin refresh
- **Criterio de aceptacion:** Token refresh transparente antes de expiracion

### 5. AWS SDK integration
- **Prioridad:** Media
- **Impacto:** Modo AWS_REAL completo con Cognito, S3, SQS, EventBridge
- **Dependencia:** Terraform templates ya existen
- **Estado actual:** Templates Terraform, cero SDK en app code
- **Criterio de aceptacion:** Auth via Cognito, storage via S3, eventos via EventBridge en runtime

## Nice-to-have

### 6. ProviderResult en backend
- **Prioridad:** Baja
- **Impacto:** Trazabilidad end-to-end backend → frontend
- **Dependencia:** NestJS interceptor + DTO wrapper
- **Estado actual:** ProviderResult es frontend-only
- **Criterio de aceptacion:** API responses incluyen source/confidence metadata

### 7. Mode switching UI
- **Prioridad:** Baja
- **Impacto:** Cambio de modo desde la UI con confirmacion y audit
- **Dependencia:** Ninguna
- **Estado actual:** Solo via env var o localStorage
- **Criterio de aceptacion:** Dropdown en header con confirmacion modal

### 8. Capability dashboard
- **Prioridad:** Baja
- **Impacto:** Vista dedicada de estado de capabilities por dominio
- **Dependencia:** Capability context dinamico (#1)
- **Estado actual:** No existe
- **Criterio de aceptacion:** Pagina mostrando tier/degradaciones/restricciones por dominio

