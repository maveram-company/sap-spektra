# SAP Spektra — Domain Model

## Entity Relationship Overview

```
Organization (tenant)
├── Users (via Membership)
├── Systems
│   ├── Components → Instances
│   ├── Hosts → HostMetrics
│   ├── Dependencies
│   ├── Breaches
│   ├── HealthSnapshots
│   ├── HAConfig
│   ├── SystemMeta
│   └── Connectors
├── Alerts
├── Events
├── ApprovalRequests
├── Runbooks → RunbookExecutions
├── OperationRecords
├── AuditEntries
└── ApiKeys

Standalone:
├── Plans
├── JobRecords
├── TransportRecords
└── CertificateRecords
```

## SAP System Classification

### Stack Types
| Type | Description | Examples |
|------|-------------|---------|
| `ABAP` | Classic ABAP stack | S/4HANA, ECC, BW/4HANA |
| `JAVA` | Java-based stack | SAP PO, PI, Enterprise Portal |
| `DUAL_STACK` | Both ABAP + Java | SolMan, older ECC installations |
| `EDGE` | Lightweight edge deployments | Edge services |
| `DB` | Database-only | Standalone HANA |
| `MANAGED_CLOUD_RESTRICTED` | RISE/PCE managed | Limited monitoring access |

### Deployment Models
| Model | Monitoring Level |
|-------|-----------------|
| `ON_PREMISE` | Full stack (agent) |
| `AWS_HOSTED` / `AZURE_HOSTED` / `GCP_HOSTED` | Full stack (agent) |
| `RISE_MANAGED` | Restricted (no host/OS metrics) |
| `PCE_MANAGED` | Restricted |

### Monitoring Capability Profiles
| Profile | Host | OS | SAP | DB | Topology | Runbooks |
|---------|------|-----|-----|-----|----------|----------|
| `FULL_STACK_AGENT` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `SAP_APP_ONLY` | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `DB_AND_APP_ONLY` | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| `RISE_RESTRICTED` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `CONNECTOR_LIMITED` | ❌ | ❌ | Partial | ❌ | ❌ | ❌ |

## Key Models

### System (25+ fields)
The central entity representing a registered SAP system. Includes:
- SAP identity: `sid`, `sapProduct`, `productFamily`, `sapStackType`
- Infrastructure: `dbType`, `environment`, `deploymentModel`
- Monitoring: `connectionMode`, `monitoringCapabilityProfile`, capability flags
- Health: `healthScore` (0-100), `status`, `lastCheckAt`

### Alert
Lifecycle: `active` → `acknowledged` → `resolved`
Levels: `critical`, `warning`, `info`
Escalation: `L1`, `L2`, or `-`

### ApprovalRequest
Workflow: `PENDING` → `APPROVED` | `REJECTED` | `EXPIRED` | `EXECUTED`
Links to: runbook, system, metric breach

### Runbook + RunbookExecution
Gate types: `SAFE` (auto-execute if `autoExecute=true`), `HUMAN` (requires approval)
Results: `PENDING` → `RUNNING` → `SUCCESS` | `FAILED`
