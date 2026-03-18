# Contributing to SAP Spektra

## Development Setup

```bash
./scripts/dev-setup.sh   # Docker + DB + Seed
./scripts/dev-start.sh   # API + Frontend
```

## Code Standards

- **Backend**: TypeScript strict mode, NestJS patterns, Prisma ORM
- **Frontend**: TypeScript with React 19, Tailwind CSS 4, Vitest
- **Commits**: Conventional commits (`fix:`, `feat:`, `chore:`, `docs:`, `refactor:`)

## Pull Request Process

1. Create a feature branch from `main`
2. Make changes with tests
3. Ensure all checks pass:
   - `cd apps/api && npm test && npx tsc --noEmit`
   - `cd frontend && npm test && npx tsc --noEmit && npm run build`
4. Submit PR with description of changes

## Testing

| Layer | Framework | Command |
|-------|-----------|---------|
| Backend unit | Jest | `cd apps/api && npm test` |
| Frontend unit | Vitest | `cd frontend && npm test` |
| E2E | Playwright | `npx playwright test` |

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design.
See [docs/](./docs/) for full documentation portal.
