# SAP Spektra v1.0

Plataforma serverless de monitoreo inteligente y remediacion automatizada para sistemas SAP en AWS. Combina 20 funciones Lambda, 13 tablas DynamoDB, 7 casos de uso de IA (Amazon Bedrock / Claude) y 18 runbooks para mantener tus sistemas SAP operando 24/7.

## Arquitectura

- **20 Lambda Functions** — Monitoreo, remediacion, discovery, reporting, IA, notificaciones
- **13 DynamoDB Tables** — Sistemas, incidentes, metricas, discovery, landscape, approvals
- **API Gateway v2** — HTTP API con JWT Authorizer (Cognito), CORS restrictivo
- **7 AI Use Cases** — Root cause analysis, prediccion, Safety Gate, chatbot (Bedrock/Claude)
- **18 Runbooks** — Remediacion automatizada con governance (Safety Gate, Evidence Pack)
- **Auto-Discovery** — Deteccion de roles SAP (ASCS/ERS/PAS/HANA), kernel, HA via SSM
- **EWA Automatizado** — Reporte semanal de salud equivalente al EWA de Solution Manager
- **Noise Optimizer** — Dedup/correlation de alertas, storm detection, cooldown
- **Per-Server Monitoring** — Dashboard Grafana-style con 24+ metricas SAP por servidor
- **Multi-DB Monitoring** — Paneles especificos por motor: HANA, MaxDB, ASE, Oracle, MSSQL, DB2
- **Dependency Evaluation** — Pre-chequeo de dependencias (SSM, sapcontrol, saposcol, CW Agent, DB tools, RFC) con remediacion guiada
- **Backup Alerts** — Alerta automatica si backup >24h con ejecucion directa de runbook
- **9 Sistemas SAP** — ECC, S/4HANA, SolMan, BW/4HANA, CRM, GRC, PI/PO en 9 instancias EC2
- **6 DB Engines** — HANA 2.0, MaxDB, ASE 16.0, Oracle 19c, MSSQL 2019, DB2 11.5

## Sistemas Monitoreados (Mock)

El mock dashboard incluye 9 sistemas SAP en 9 instancias EC2:

| SID | Producto | DB | OS | Ambiente |
|-----|----------|----|----|----------|
| OMP | SAP ECC | MaxDB | Windows Server 2019 | PRD |
| OCP | SAP S/4HANA | HANA 2.0 | SUSE Linux 15 | QAS |
| OAP | SAP S/4HANA | HANA 2.0 | SUSE Linux 15 | DEV |
| SM1 | SAP SolMan 7.2 | MaxDB | Windows Server 2019 | PRD |
| OMR | SAP ECC | HANA 2.0 | RHEL 8 | PRD |
| BWP | SAP BW/4HANA | ASE 16.0 | SUSE Linux 15 | PRD |
| CRP | SAP CRM 7.0 | Oracle 19c | RHEL 8 | PRD |
| GRC | SAP GRC 12.0 | MSSQL 2019 | Windows Server 2022 | QAS |
| POP | SAP PO 7.5 | DB2 11.5 | RHEL 9 | PRD |

Productos SAP soportados: ECC, S/4HANA, SolMan, BW/4HANA, CRM, GRC, PI/PO.
Motores de base de datos: HANA 2.0, MaxDB, ASE 16.0, Oracle 19c, MSSQL 2019, DB2 11.5 (los 6 motores soportados por SAP).

## Seguridad

- API Gateway v2 con JWT Authorizer (Cognito User Pool)
- RBAC: Admin, Operator, Viewer con permisos granulares por ruta
- Tokens HMAC-SHA256 para approval links (sin JWT)
- Cifrado KMS en reposo (DynamoDB, SQS)
- CORS restrictivo (solo dominios autorizados)
- Audit trail con hash chain inmutable

## Documentacion

Toda la documentacion del proyecto esta en formato HTML interactivo:

```
docs/index.html                  Portal principal
docs/arquitectura.html           Arquitectura tecnica (20 Lambdas, 13 tablas)
docs/api-reference.html          Referencia API REST (20+ endpoints)
docs/pitch-comercial.html        Pitch comercial (14 slides)
docs/auto-discovery.html         Auto-discovery de instancias SAP
docs/runbook-governance.html     Runbook governance (Safety Gate, Evidence Pack)
docs/ewa-equivalent.html         EWA automatizado con Health Score
docs/wizard-ssot.html            Wizard SSOT (Single Source of Truth)
docs/market-comparison.html      Comparacion de mercado (Cloud ALM, SolMan, FRUN, Dynatrace)
docs/per-server-monitoring.html  Monitoreo per-server (Grafana-style, Multi-DB, Dependencies)
docs/wizard-admin.html           Guia del Setup Wizard — Administrador
docs/wizard-operador.html        Guia del Setup Wizard — Operador L1
docs/wizard-escalacion.html      Guia del Setup Wizard — Escalacion L2
docs/wizard-viewer.html          Guia del Setup Wizard — Viewer
docs/ui-reference.html           Referencia de componentes UI (SSOT renderer)
docs/dashboard-admin.html        Dashboard — Administrador
```

## Inicio Rapido — Setup Wizard

```bash
cd setup
npm install
node server.js            # Modo real (requiere AWS CLI configurado)
MOCK=true node server.js  # Modo demo (sin AWS, datos simulados)
```

El wizard se abre automaticamente en `http://localhost:3456`

## Mock Dashboard

Con el servidor en modo mock, accede al dashboard completo en:

```
http://localhost:3456/mock/dashboard
```

### Per-Server Grafana-Style Dashboard

Al hacer clic en cualquier sistema se abre un dashboard detallado estilo Grafana con:

- **24+ metricas SAP** — Availability, Monitor Status/Performance, Users (sm04), CPU (st06), Last Minute Load (st03), Avg DB Time, Response Time Distribution, Dialog Work Processes (sm66), Free Memory, Short Dumps, Lambda Errors, Monitor Ping
- **Evaluacion de dependencias** — Panel colapsable que verifica SSM Agent, sapcontrol, saposcol, CloudWatch Agent, herramientas de BD y conectividad RFC. Si falla alguna: boton "Remediar" con pasos detallados
- **Monitor especifico por BD** — Paneles adaptados al motor de base de datos:
  - **HANA**: Alerts (Errors/High/Medium), HSR Status, Connections, CPU/RAM/Disk DATA/LOG/TRACE
  - **MaxDB**: DB State, Data Volume/Log Volume, Data Cache Hit %, Lock Wait %, Sessions
  - **ASE**: Transaction Log, Physical Data/Log, Cache Hit Ratio, Blocking Chains
  - **Oracle**: Tablespace %, Blocked Sessions, Archive Log
  - **MSSQL**: Log File %, Data File %, Connections
  - **DB2**: Tablespace %, Log %, Connections
- **Alerta de backup** — Si el ultimo backup tiene >24h, banner rojo con opcion de ejecutar RB-BACKUP-001 (comando especifico por motor de BD). Para sistemas offline: boton deshabilitado indicando restaurar conectividad
- **Metricas OS** — CPU, Memory, Disk con barras de progreso
- **System Information** — Tabla con SID, ambiente, tipo, BD, OS, instance ID/type, IP, Health Score, MTTR, MTBF, uptime
- **Alertas y Runbooks** — Tablas filtradas por sistema

## Estructura del Proyecto

```
cfn/        CloudFormation template (infraestructura AWS)
lambda/     20 funciones Lambda (logica de negocio)
  utilidades/   Token tracker, circuit breaker, logger estructurado
setup/      Setup Wizard Portal (Express.js, 10 pasos)
frontend/   Dashboard React (Vite + React 19)
shared/     SSOT: ui-schema.json + ui-renderer.js
docs/       Documentacion completa en HTML (16 paginas)
scripts/    Scripts de despliegue
```

## Tests

```bash
cd sap-spektra
node tests/run-all.js     # Suite completa (56 tests)
```

Tests incluidos:
- **Classifier** (19 tests) — Clasificacion de roles SAP (HANA, ASCS, ERS, PAS, WebDisp)
- **Circuit Breaker** (13 tests) — Patron circuit breaker (CLOSED/OPEN/HALF_OPEN)
- **Logger** (13 tests) — Logging JSON estructurado + CloudWatch EMF
- **Scan Orchestrator** (11 tests) — Escaneo mock con concurrencia, batch, eventos

## Despliegue

```bash
./scripts/deploy.sh                    # Despliegue completo
./scripts/deploy.sh --package-only     # Solo empaquetar Lambdas
./scripts/deploy.sh --skip-package     # Solo CloudFormation
```

---

*SAP Spektra v1.0 — Mission Control for SAP Operations*
