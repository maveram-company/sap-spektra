# Changelog — SAP Spektra

## v1.4 — Hardening + Evolucion (Marzo 2026)

### Breaking Changes

- **Credenciales DB eliminadas del codigo fuente:** `-u CONTROL,password` removido de `runbook-engine/index.js` y `ha-monitor/index.js`. Las credenciales ahora se leen desde AWS Secrets Manager (`sap-alwaysops/{SID}/{dbType}-credentials`). **Migracion:** Crear los secretos en Secrets Manager antes de desplegar.
- **Boton "Reconocer" renombrado** a **"Tomar en gestion"**. Ahora guarda `ackBy` (email del operador) y `ackAt` (timestamp ISO). La UI muestra badge "EN REVISION".
- **Resolver alerta** requiere `resolutionNote` (obligatoria) y `resolutionCategory` (enum: `false_positive`, `mitigated`, `accepted_risk`, `fixed`, `workaround_applied`).
- **Input sanitization:** Blacklist regex reemplazado por whitelist por runbook ID (`ALLOWED_DB_SUBCOMMANDS`). Custom runbooks usan blacklist como fallback.
- **Auth middleware:** Deny-by-default. Sin token/claims = HTTP 401. Claims de API Gateway priorizados sobre JWT decode manual.
- **IAM:** `kms:*` reemplazado por acciones especificas. SSM scoped a tag `Project: SAP-AlwaysOps`. CollectorRole ya no tiene `ssm:SendCommand`.
- **Wizard schema:** Fases renombradas de A/B/C a `setup`/`validate`/`activate`. Nuevos tipos de campo: `capabilities-matrix`, `dry-run-results`, `policy-check-results`, `evidence-pack-summary`.

### Nuevos Modulos

| Modulo | Proposito |
|--------|-----------|
| `execution-model.js` | Modelo unificado de ejecucion (RUNBOOK, SCHEDULED, SIMULATION, SCAN, CHAIN) |
| `facts-store.js` | Facts versionados por SID/host con DynamoDB y TTL 90 dias |
| `capabilities-matrix.js` | Matriz de capacidades por SID (SSM, DB, HA, producto) |
| `policy-engine.js` | Motor de politicas deny-by-default con reglas SSM |
| `runbook-schema.js` | Schema declarativo de runbooks con prechecks y rollback |
| `message-format.js` | Mensajes estandarizados con nextSteps y errorGuides |
| `dry-run-simulator.js` | Simulador sin ejecucion real (policy + capabilities + costo) |
| `evidence-pack.js` | Evidence pack firmado con hash chain SHA-256 y KMS |
| `execution-lock.js` | Locks por SID con DynamoDB conditional writes y TTL |

### Nuevos Endpoints API

| Method | Path | Descripcion |
|--------|------|-------------|
| POST | `/alerts/{id}/ack` | Tomar alerta en gestion (idempotente) |
| POST | `/alerts/{id}/resolve` | Resolver alerta con nota y categoria |

### Seguridad

- AWS Secrets Manager para credenciales DB con cache 5 min y fallback XUSER keystore
- Whitelist de subcomandos DB por runbook ID (previene inyeccion)
- Auth deny-by-default con validacion de expiracion en claims Y JWT
- Per-SID execution locks con DynamoDB conditional writes
- Idempotencia con `generateExecutionId()` SHA-256 determinista
- IAM permissions scoped: KMS acciones especificas, SSM por tag, Secrets Manager por path

### Alertas UX

- "Tomar en gestion": Idempotente, guarda ackBy/ackAt, badge "EN REVISION", "Escalacion: pausada"
- "Resolver": Modal con 5 categorias y nota obligatoria, badge "RESUELTA" con auditoria
- Backend: Validacion de resolutionCategory y resolutionNote obligatorias

### Documentacion

- Tema claro/oscuro en las 25 paginas de docs con toggle persistente (localStorage)
- `theme.css`: Variables CSS con contraste AA para ambos temas
- `theme-toggle.js`: IIFE que aplica tema antes del render, sin flash
- `dashboard-operador.html`: Nueva seccion "Que hace Tomar en gestion?"
- `release-notes.html`: Changelog v1.4 completo

### Tests

- **178 tests** en total, 0 fallidos
- Nuevos test suites: auth-middleware (16), input-validator (27), execution-lock (6), execution-model (15), capabilities-matrix (16), policy-engine (17), evidence-pack (13), dry-run-simulator (12), alerts-ack-resolve (13)

### Verificacion End-to-End

1. `grep -r 'CONTROL,password' lambda/` = 0 resultados
2. Tests de inyeccion: whitelist rechaza metacaracteres shell
3. Sin token/claims = HTTP 401 (deny-by-default)
4. `kms:*` eliminado del CloudFormation, SSM scoped por tag
5. Alertas: "Tomar en gestion" muestra badge EN REVISION + responsable + hora
6. Resolver: sin nota/categoria = error, no permite cerrar
7. Toggle tema funciona en todas las paginas docs, persiste en localStorage
8. `node tests/run-all.js` = 178 passed, 0 failed
