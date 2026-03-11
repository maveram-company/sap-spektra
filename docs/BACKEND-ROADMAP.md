# SAP Spektra — Backend Real: Roadmap Técnico

> Documento interno para equipo de desarrollo. Define contratos, prioridades y
> estrategia de migración de frontend-only (mock) a producto con backend real.

## Estado actual del frontend

El frontend ya tiene preparación parcial para un backend real:

| Componente | Estado | Archivo |
|---|---|---|
| API Client | Listo, no usado | `frontend/src/hooks/useApi.js` |
| API Endpoints definidos | 20 endpoints listos | `useApi.js` líneas 27-47 |
| Auth Context | Demo con slots Cognito | `frontend/src/contexts/AuthContext.jsx` |
| Tenant Context | Multi-tenant mock | `frontend/src/contexts/TenantContext.jsx` |
| Config | demoMode flag + Cognito env vars | `frontend/src/config.js` |
| Mock Data | 23 páginas importan directamente | `frontend/src/lib/mockData.js` |

**Bloqueador principal:** Las 23 páginas importan `mockData.js` directamente en
lugar de usar `useApi()`. La migración requiere reemplazar estas importaciones.

---

## 1. Contratos API objetivo

Basados en los endpoints ya definidos en `useApi.js`:

### 1.1 Autenticación (Cognito)

```
POST /auth/login          → { token, user, organization }
POST /auth/refresh        → { token }
POST /auth/logout         → { success }
GET  /auth/me             → { user, organization, role }
```

Configuración ya preparada en `config.js`:
- `VITE_COGNITO_REGION`
- `VITE_COGNITO_USER_POOL_ID`
- `VITE_COGNITO_CLIENT_ID`

### 1.2 Tenant / Organización

```
GET  /organization                → { id, name, plan, settings, limits, usage }
GET  /organization/users          → [{ id, name, email, role, status, lastLogin }]
POST /organization/users          → { id } (invitar usuario)
PUT  /organization/users/:id/role → { success }
GET  /organization/audit-log      → [{ id, timestamp, user, action, resource }]
```

Roles oficiales: `admin`, `escalation`, `operator`, `viewer`
Planes oficiales: `starter`, `professional`, `enterprise`

### 1.3 Sistemas SAP

```
GET  /systems                     → [{ id, sid, type, dbType, environment, mode, healthScore, status, description }]
GET  /systems/:id                 → { ...system, instances, hosts, meta, serverMetrics }
GET  /systems/:id/metrics?hours=N → [{ timestamp, cpu, memory, disk, iops }]
GET  /systems/:id/breaches?limit=N → [{ id, metric, value, threshold, severity, timestamp }]
GET  /systems/:id/sla             → { mttr, mtbf, availability }
POST /admin/systems               → { id } (registrar sistema)
```

### 1.4 Alertas y Eventos

```
GET  /alerts?status=active        → [{ id, systemId, level, title, message, status, escalation }]
PUT  /alerts/:id/acknowledge      → { success }
PUT  /alerts/:id/resolve          → { success }
GET  /events?limit=50&offset=0    → { items: [...], total, hasMore }
```

### 1.5 Aprobaciones

```
GET  /approvals?status=PENDING    → [{ id, systemId, runbookId, severity, status }]
POST /approvals/:id/approve?token=T → { success }
POST /approvals/:id/reject?token=T  → { success }
```

### 1.6 Operaciones y Runbooks

```
GET  /scheduled-operations        → [{ id, systemId, type, status, scheduledTime }]
GET  /runbooks                    → [{ id, name, costSafe, auto, dbType, description }]
POST /runbooks/:id/execute        → { executionId, status }
POST /runbooks/:id/dry-run        → { result, preview }
GET  /analytics/runbooks          → { totalExecutions, successRate, dailyTrend }
```

### 1.7 HA / DR

```
GET  /ha/systems                  → [{ systemId, haEnabled, haStatus, haStrategy, ... }]
GET  /ha/systems/:id/prereqs      → [{ name, status, required, details }]
POST /ha/systems/:id/operate      → { operationId, status }
GET  /ha/history                  → [{ id, type, status, duration }]
```

### 1.8 AI / Chat

```
POST /chat                        → { response, sources }
GET  /advisor-results?systemId=X  → { predictions, recommendations }
```

### 1.9 Conectores

```
GET  /connectors                  → [{ id, systemId, connectionMethod, status, latencyMs }]
GET  /connectors/:id/health       → { status, lastHeartbeat, latencyMs }
```

### 1.10 Health

```
GET  /health/spektra              → { status, version, services: [...] }
```

---

## 2. Estrategia de migración: Mock → API

### Fase A: Data Service Layer (sin backend)

Crear `frontend/src/services/dataService.js` que:
1. En `demoMode=true`: retorna datos de `mockData.js` con delay simulado
2. En `demoMode=false`: llama a `useApi` / `api.*`

```javascript
// Ejemplo de patrón
import config from '../config';
import { api } from '../hooks/useApi';
import { mockSystems } from '../lib/mockData';

export const dataService = {
  getSystems: async () => {
    if (config.features.demoMode) {
      await new Promise(r => setTimeout(r, 400));
      return mockSystems;
    }
    return api.getSystems();
  },
  // ... resto de métodos
};
```

Luego reemplazar en cada página:
```diff
- import { mockSystems } from '../lib/mockData';
+ import { dataService } from '../services/dataService';
```

### Fase B: Auth real (Cognito)

1. Instalar `@aws-amplify/auth` o `amazon-cognito-identity-js`
2. Modificar `AuthContext.jsx`:
   - Si `demoMode=true`: mantener login demo actual
   - Si `demoMode=false`: usar Cognito para login/signup/MFA
3. El token JWT de Cognito se pasa en header `Authorization: Bearer {token}`
   (ya implementado en `useApi.js` línea 62)

### Fase C: Backend API

Tecnología sugerida según stack existente:
- **Runtime:** Node.js (Lambda) — ya existe en `/lambda/`
- **Base de datos:** DynamoDB — ya definido en CFN
- **Auth:** Cognito — ya configurado en CFN
- **API Gateway:** HTTP API — ya definido en CFN

---

## 3. Prioridad de módulos para migración

| Prioridad | Módulo | Razón |
|---|---|---|
| 1 | Auth (Cognito) | Fundación para todo lo demás |
| 2 | Systems + Dashboard | Core del producto, primera impresión |
| 3 | Alerts + Events | Valor operativo inmediato |
| 4 | Connectors | Necesario para datos reales |
| 5 | Runbooks + Approvals | Automatización — diferenciador |
| 6 | HA Control | Complejidad alta, valor alto |
| 7 | AI Analysis | Requiere Bedrock, último |
| 8 | Analytics + Reports | Requiere datos históricos reales |
| 9 | Transports + Jobs + Certs | Features de nicho |

---

## 4. Dependencias externas requeridas

| Servicio | Propósito | Estado |
|---|---|---|
| AWS Cognito | Autenticación + MFA | CFN template existe |
| AWS DynamoDB | Persistencia | CFN template existe |
| AWS API Gateway | API REST | CFN template existe |
| AWS Lambda | Backend functions | Código existe en /lambda/ |
| AWS SSM | Config de sistemas SAP | Código existe |
| Amazon Bedrock | AI Analysis (Claude) | Código existe en lambda |
| SAP Cloud Connector | Conectividad SAP | Diseñado, no implementado |

---

## 5. Variables de entorno requeridas

```env
# API
VITE_API_URL=https://api.spektra.maveram.com

# Cognito
VITE_COGNITO_REGION=us-east-1
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
```

---

## 6. Archivos clave para la migración

| Archivo | Acción |
|---|---|
| `frontend/src/config.js` | Cambiar `demoMode: false` cuando backend esté listo |
| `frontend/src/hooks/useApi.js` | Ya listo, solo falta que las páginas lo usen |
| `frontend/src/contexts/AuthContext.jsx` | Agregar rama Cognito |
| `frontend/src/contexts/TenantContext.jsx` | Conectar a API /organization |
| `frontend/src/lib/mockData.js` | Mantener como fallback en demoMode |
| `frontend/src/services/dataService.js` | CREAR — capa intermedia mock/API |
