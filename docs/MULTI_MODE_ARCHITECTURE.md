# SAP Spektra — Multi-Mode Architecture

## Proposito

SAP Spektra opera como un unico producto con modelo funcional canonico. Los modos REAL, FALLBACK, MOCK y RESTRICTED son formas equivalentes de operar la misma plataforma, con los mismos contratos, estados, permisos, evidencia y gobierno. Las diferencias se limitan al motor de ejecucion, la fuente de datos, el nivel de confianza y el grado de efecto operativo.

## Principios

1. **Un solo producto.** No existen versiones separadas para demo, produccion o modo restringido.
2. **Paridad funcional.** La UX, contratos, acciones, permisos, aprobaciones, estados, evidencia y gobierno son identicos entre modos.
3. **Transparencia obligatoria.** El usuario siempre sabe en que modo opera, de donde vienen los datos, que tan confiables son y que restricciones aplican.
4. **Providers intercambiables.** Cada dominio tiene un provider por modo, todos implementando el mismo contrato. La UI nunca elige provider directamente.
5. **Evidencia uniforme.** Toda accion produce ProviderResult<T> con metadata de source, confidence, degraded, timestamp y reason.

## Definicion de modos

### REAL
Datos vivos del backend via API REST. Acciones con efecto operativo real. Confidence: high. Source: api. Si el backend cae, auto-degrada a FALLBACK.

### FALLBACK
Intenta operar como REAL. Cada llamada API esta protegida: si falla, degrada a mock marcado explicitamente como degradado. El usuario siempre sabe cuando ocurrio degradacion. Confidence: medium. Source: api (intento) o cache/simulation (fallback).

### MOCK
Operacion completa sin backend. Datos simulados con delay. Solo lectura desde el punto de vista operativo. Ideal para demos y desarrollo. Confidence: low. Source: simulation.

### RESTRICTED
Lectura limitada, escritura explicitamente bloqueada. No es un fallo sino una restriccion intencional. Para auditorias, entornos regulados o acceso minimo por politica. Confidence: low. Source: rules/policy.

## Diferencias permitidas entre modos

- Latencia
- Side effects reales
- Origen exacto del dato
- Profundidad de integracion
- Efecto operativo fisico

## Diferencias NO permitidas

- UX / pantallas
- Contratos / DTOs
- Acciones visibles
- Permisos / roles
- Aprobaciones
- Estados / taxonomia
- Evidencia / estructura
- Gobierno / riesgo
- Explicabilidad

## Modelo canonico

### ProviderResult<T>

Toda respuesta de provider esta wrapeada en:

```typescript
interface ProviderResult<T> {
  data: T;
  source: ProviderTier;        // 'real' | 'mock' | 'fallback' | 'restricted'
  confidence: 'high' | 'medium' | 'low';
  timestamp: string;
  degraded: boolean;
  reason?: string;
}
```

### Capability Engine

`resolveCapabilities(mode, backendReachable)` determina por dominio:
- tier activo
- readOnly
- degraded
- confidence
- source
- reason

### Provider Registry

`getRegistry(mode)` retorna un objeto con los 12 providers activos segun el modo. El orchestrator (`dataService.ts`) delega al registry y unwraps `.data` para backward compat con las paginas.

## Contratos por dominio

Cada dominio tiene una interface TypeScript unica implementada por real, mock, fallback y (donde aplica) restricted providers. Los ViewModels tipados son:

- SystemViewModel, AlertViewModel, AlertStats
- RunbookViewModel, ExecutionViewModel
- ApprovalViewModel, EventViewModel, OperationViewModel
- HAConfigViewModel, UserViewModel, AuditEntryViewModel
- ConnectorViewModel
- ApiRecord (para analytics, landscape, chat)

## UX Multi-modo

| Componente | Proposito |
|-----------|-----------|
| ModeBadge | Pill badge REAL/FALLBACK/MOCK/RESTRICTED |
| SourceIndicator | Source + confidence + degraded + timestamp |
| CapabilityBadge | Badge por accion (View:Live, Execute:Fallback, Failover:Restricted) |
| GovernanceContext | Restricciones, aprobacion, riesgo |
| EvidencePanel | Panel colapsable con metadata completa |

## Matriz de cobertura

| Dominio | Contract | Real | Mock | Fallback | Restricted | Parity | UX metadata |
|---------|:--------:|:----:|:----:|:--------:|:----------:|:------:|:-----------:|
| systems | Si | Si | Si | Si | Dedicado | Si | Badge+Source |
| alerts | Si | Si | Si | Si | Dedicado | Si | Badge+Source |
| runbooks | Si | Si | Si | Si | Dedicado | Si | Badge+Capability+Governance+EvidencePanel |
| approvals | Si | Si | Si | Si | Dedicado | Si | Badge+Capability+Governance+EvidencePanel |
| ha | Si | Si | Si | Si | Dedicado | Si | Badge+Capability+Governance+Source+EvidencePanel |
| connectors | Si | Si | Si | Si | Dedicado | Si | Badge+Source |
| events | Si | Si | Si | Si | Dedicado | Si | Badge+Source |
| operations | Si | Si | Si | Si | Dedicado | Si | Badge |
| analytics | Si | Si | Si | Si | Dedicado | Si | Badge+Source |
| admin | Si | Si | Si | Si | Dedicado | Si | Badge |
| landscape | Si | Si | Si | Si | Dedicado | Si | Badge+Source |
| chat | Si | Si | Si | Si | Dedicado | Si | Badge |

**Dedicado** = Restricted provider propio con semantica de bloqueo intencional. 12/12 dominios completados.

## Estado actual de madurez

- 12/12 dominios con contract + real + mock + fallback
- 12/12 dominios con restricted provider dedicado
- ProviderResult<T> como contrato canonico en todos los providers
- Capability engine resolviendo per-dominio
- UX multi-modo visible en 12 paginas
- 1,446 tests validando el modelo
- EvidencePanel integrado en RunbooksPage, ApprovalsPage, HAControlCenterPage
- Playwright E2E configurado en CI pipeline
- 0 errores TypeScript, strict mode habilitado
