# Changelog

All notable changes to SAP Spektra will be documented in this file.

## [1.5.0] — 2026-03-17

### Added
- TypeScript strict typing for all frontend components, contexts, hooks, and services
- Audit report (AUDIT-REPORT.md) documenting claims vs code verification
- Mermaid.js diagrams replacing ASCII art in all documentation
- Platform Status section in documentation (Implemented vs Roadmap)
- vite-env.d.ts for Vite environment type support

### Fixed
- 517 TypeScript errors resolved to 0 in frontend
- Documentation corrected: 78 endpoints (was 97+), 27 models (was 24), 119 runbooks (was 123)
- JWT_SECRET aligned between docker-compose.yml and .env.example
- Version numbers corrected across all docs (NestJS 11, React 19, Vite 7, Tailwind 4)

### Removed
- 23 orphaned legacy test files referencing deleted Lambda serverless code
- 5 legacy mock utility files (aws-sdk-mock, dynamodb-mock, etc.)

## [1.4.0] — 2026-03-12

### Added
- HA/DR orchestration module with failover management
- Enterprise security hardening (XSS protection, race condition fixes)
- Comprehensive Prisma schema with 27 models and cascade deletes
- Multi-tenant isolation with TenantGuard
- Rate limiting on auth and execution endpoints

### Fixed
- Tenant isolation in all database queries
- JWT user validation and cascade deletes
- Frontend React state correctness
