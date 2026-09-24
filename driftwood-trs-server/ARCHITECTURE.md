# Architecture — Driftwood TRS Server

See `TECH_STACK.md` for the full dependency list. This document covers module layout and the API surface.

## Folder structure

```
src/
├── main.ts / app.module.ts / app.controller.ts / app.service.ts   # root module, health check
├── admin/
│   ├── admin.module.ts
│   └── users/                     # admin-only user management
│       ├── admin-users.controller.ts, admin-users.service.ts, dto/
├── ai-prompts/                     # admin-managed AI prompt versions
│   ├── ai-prompts.controller.ts, ai-prompts.module.ts, ai-prompts.service.ts, dto/
├── auth/                           # better-auth integration, guards, decorators, RBAC
│   ├── auth.ts (betterAuth config), auth.module.ts, auth.guard.ts
│   ├── permission.guard.ts, roles.guard.ts, roles.ts (statement/roles)
│   ├── roles.decorator.ts, permission.decorator.ts, public.decorator.ts, current-user.decorator.ts
├── db/
│   ├── index.ts (drizzle client), migrate.ts (migration runner), schema.ts (barrel)
│   └── schema/                     # auth.ts, documents.ts, ai-prompts.ts
├── documents/                      # core domain: upload, classification, review workflow
│   ├── documents.controller.ts       # user-facing
│   ├── analyst-documents.controller.ts # analyst/admin review
│   ├── documents.module.ts, documents.service.ts, constants/evidence.ts, dto/
├── libs/                           # cross-cutting infrastructure
│   ├── config.ts (zod-validated env), logger.ts, nest-logger.ts, mailer.ts
│   ├── pagination.ts, password.ts, redis.ts, request-context.ts, request-context.middleware.ts
├── scripts/seed-super-admin.ts
├── upload/                         # S3 presigned upload URLs
│   ├── upload.controller.ts, upload.module.ts, upload.service.ts, dto/
└── users/                          # self-service user profile
    ├── users.controller.ts, users.module.ts, users.service.ts, safe-user.ts, dto/
```

## Pattern

Modular, layered NestJS app. Each business domain (`users`, `admin`, `ai-prompts`, `documents`, `upload`, `auth`) is a self-contained Nest module: `Controller` (HTTP) → `Service` (business logic) → `dto/` (class-validator shapes) → shared `db/schema` (Drizzle). Cross-cutting concerns (config, logging, Redis, request context, mail, password hashing, pagination) live in `src/libs/`. Global guards (`ThrottlerGuard`, `AuthGuard`) and the request-context middleware are wired centrally in `app.module.ts`.

## API routes

Global prefix is `API_PREFIX` (default `api`), except better-auth's own routes which are hardcoded at `/api/auth/*` and intercepted before Nest's routing/body-parser pipeline.

| Controller | Base path | Endpoints |
| --- | --- | --- |
| `app.controller.ts` | `` (root) | `GET /`, `GET /health` |
| `users/users.controller.ts` | `users` | `GET /me`, `PATCH /me`, `GET /`, `GET /:id` |
| `admin/users/admin-users.controller.ts` | `admin/users` | `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/ban`, `POST /:id/unban` |
| `ai-prompts/ai-prompts.controller.ts` | `admin/ai-prompts` | `GET /`, `GET /versions`, `GET /versions/:id`, `POST /` |
| `documents/documents.controller.ts` | `documents` | `GET /evidence-categories`, `GET /evidence-summary`, `GET /ai-review-summary`, `GET /ai-review-status`, `POST /trigger-ai-review`, `POST /`, `GET /`, `GET /:id`, `GET /:id/signed-url`, `GET /:id/findings`, `GET /:id/ai-analysis`, `DELETE /:id`, `PATCH /:id/classify` |
| `documents/analyst-documents.controller.ts` | `analyst/documents` | `GET /`, `GET /evidence-summary`, `POST /reset`, `POST /:id/ai-review`, `GET /:id/findings`, `POST /:id/findings`, `PATCH /:id/findings/:findingId`, `DELETE /:id/findings/:findingId`, `PATCH /:id/sufficiency`, `POST /:id/publish`, `GET /:id/ai-analysis`, `PATCH /:id/ai-analysis`, `POST /:id/ai-analysis/publish` |
| `upload/upload.controller.ts` | `upload` | `POST /presign` |
| better-auth handler | `/api/auth/*` | sign-in, sign-up, session, etc. (not Nest routing) |

## Auth & authorization flow

- `AuthGuard` is registered globally (`APP_GUARD`) — every route requires an authenticated session unless annotated `@Public()`.
- Fine-grained authorization layers on top: `@Roles()` + `RolesGuard` for role checks, `@Permission()` + `PermissionGuard` for resource-level checks, both backed by the better-auth access-control statement in `src/auth/roles.ts`.
- Roles: `user`, `analyst`, `admin`. Resources: `user`, `document`.
- `@CurrentUser()` decorator injects the authenticated user into controller handlers.

## Conventions

- New domains follow the existing module shape: `<domain>.module.ts`, `<domain>.controller.ts`, `<domain>.service.ts`, `dto/` for request/response shapes.
- Env vars are validated centrally through `src/libs/config.ts` (zod) — don't read `process.env` directly elsewhere.
- No ORM entities/repositories pattern — Drizzle is used as a typed query builder directly inside services.
