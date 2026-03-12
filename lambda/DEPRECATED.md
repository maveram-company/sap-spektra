# DEPRECATED — Lambda Functions

These Lambda functions are from the **original serverless architecture** (AWS Lambda + API Gateway + DynamoDB).

The active backend runtime is now **`apps/api/`** — a NestJS 11 modular monolith with Prisma/PostgreSQL.

These Lambda directories are kept for reference but are **not deployed or maintained**. Do not add new code here.

## Migration status

| Lambda | Replaced by (apps/api) |
|--------|----------------------|
| dashboard-api | `apps/api/src/modules/systems/`, `modules/alerts/`, etc. |
| alert-rules-engine | `modules/alerts/alerts.service.ts` |
| ha-monitor | `modules/ha/ha.service.ts` |
| ha-orchestrator | `modules/ha/ha.service.ts` |
| discovery-engine | `modules/systems/systems.service.ts` |
| chatbot-agent | `modules/ai-chat/ai-chat.service.ts` |
| runbook-engine | `modules/plans/plans.service.ts` |
| approval-gateway | `common/guards/roles.guard.ts` + `common/guards/tenant.guard.ts` |
| Other Lambdas | Pending migration or deprecated |
