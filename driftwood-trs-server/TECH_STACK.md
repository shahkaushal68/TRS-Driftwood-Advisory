# Tech Stack — Driftwood TRS Server

## Core

| Concern | Choice | Version |
| --- | --- | --- |
| Language | TypeScript (target ES2025, `module: nodenext`), strict mode | ^6.0.3 |
| Runtime | Node.js | >=24 |
| Framework | NestJS (Express adapter under the hood) | ^11.1.24 |
| Package manager | npm | >=11 |

## Data layer

| Concern | Choice | Notes |
| --- | --- | --- |
| Database | PostgreSQL | AWS RDS in production |
| ORM | Drizzle ORM + Drizzle Kit | Schema in `src/db/schema/`, migrations in `drizzle/`; `db:generate` / `db:migrate` / `db:push` / `db:studio` scripts |
| Driver | `pg` | Raw Postgres driver used by Drizzle |
| Cache / session store | Redis via `ioredis` | Upstash Redis in production; also used as better-auth's `secondaryStorage` |

## Auth & security

| Concern | Choice | Notes |
| --- | --- | --- |
| Authentication | `better-auth` | Drizzle adapter, email/password, session cookies with a 5-minute encrypted cookie cache backed by Redis. Routes mounted at `/api/auth/*`, intercepted in `main.ts` before Nest's body parser (better-auth reads the raw body itself) |
| Authorization / RBAC | better-auth `admin` plugin + custom access-control statement (`src/auth/roles.ts`) | Roles: `user`, `analyst`, `admin`; resources: `user`, `document`. Enforced via `@Roles()`/`RolesGuard` and `@Permission()`/`PermissionGuard`; `AuthGuard` is a global `APP_GUARD` unless a route is `@Public()` |
| Validation | `zod` (env config) + `class-validator` / `class-transformer` (DTOs) | Global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform` |
| Rate limiting | `@nestjs/throttler` | Global `APP_GUARD`, 100 requests / 60s |
| Security headers | `helmet` | Applied globally in `main.ts` |

## Infrastructure integrations

| Concern | Choice |
| --- | --- |
| File storage | AWS S3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) — presigned upload URLs |
| Email | `resend` — transactional email (account setup, password reset) via Resend templates |
| Logging | `pino` (structured logs) + `pino-pretty` (dev), wrapped in a custom `NestLogger`; request-scoped context via `request-context.middleware.ts` |

## Tooling

| Concern | Choice |
| --- | --- |
| Linting | ESLint 10, flat config (`eslint.config.mjs`), `typescript-eslint`, `eslint-plugin-prettier`, `eslint-config-prettier` |
| Formatting | Prettier 3 (100 col width, single quotes, semicolons, trailing commas, `arrowParens: always`, LF) |
| Testing | **None configured** — no Jest/Vitest/Supertest, no test script, no test files |
| API docs | **None configured** — no `@nestjs/swagger`; routes documented manually (see `ARCHITECTURE.md`) |
| CI/CD | GitHub Actions, triggered on GitHub Release publish; builds a multi-tag Docker image, pushes to ECR, rolling-deploys to ECS Fargate via OIDC (see `README.md`) |
| Containerization | Docker, 3-stage build (`deps` → `builder` → `runner`), `node:24-alpine`, non-root user, healthcheck at `GET /api/health` |

## Notable architectural choices

- **No test suite exists yet** — anything added here should include tests as a baseline going forward.
- **AI analysis storage**: the `ai_analysis` table stores the entire AI response as one `raw_output` jsonb column rather than per-field columns, so the AI prompt can change without a DB migration. Only `ai_verdict` and `report_status` are separate columns because server logic filters on them (see `README.md`).
- **Modular, feature-based Nest structure** — see `ARCHITECTURE.md` for the module breakdown and route reference.
