# Security Policy

## Reporting Vulnerabilities

Please do NOT open public issues for security vulnerabilities. Contact: security@maveram.com

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.5.x   | Yes       |
| < 1.5   | No        |

## Security Practices

- JWT authentication with bcrypt password hashing (cost 12)
- Multi-tenant isolation via organizationId in every query
- Input validation with class-validator (whitelist + forbidNonWhitelisted)
- Rate limiting on all sensitive endpoints
- Helmet security headers
- CORS origin restriction
- Audit logging on all state-changing operations
- API keys hashed with bcrypt, only prefix stored
- No raw SQL queries (Prisma ORM parameterized)
- Multi-stage Docker builds with non-root users
