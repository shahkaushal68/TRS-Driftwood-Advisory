# Tech Stack — Driftwood TRS Admin Panel

Client-side SPA. No server-side rendering, no Node runtime in production — the build output is static files served from S3/CloudFront (see `README.md` for the deploy pipeline).

## Core

| Concern | Choice | Version |
| --- | --- | --- |
| UI framework | React (function components, hooks) | ^19.2.6 |
| Compiler | React Compiler (via `babel-plugin-react-compiler`) | ^1.0.0 |
| Language | TypeScript, strict mode | ^6.0.3 |
| Build tool | Vite (Rolldown-based plugin pipeline) | ^8.0.14 |
| Package manager | npm | >=11 |
| Runtime (dev only) | Node.js | >=24 |

## Routing & State

| Concern | Choice | Notes |
| --- | --- | --- |
| Routing | TanStack Router | File-based routes under `src/routes/`, auto code-splitting, generated route tree at `src/routeTree.gen.ts` (never hand-edit) |
| Server state / data fetching | TanStack Query v5 | Query/mutation option factories colocated with each API module in `src/common/api/` |
| Client/global state | Zustand | Single store (`useUserStore`) holding the authenticated user profile |
| Forms | React Hook Form + Mantine Form | Mantine Form used in most modals/forms; RHF also present |

## UI

| Concern | Choice |
| --- | --- |
| Component library | Mantine v9 (`core`, `dates`, `form`, `hooks`, `modals`) |
| Icons | Phosphor Icons (`@phosphor-icons/react`) |
| Markdown editing | `@uiw/react-md-editor` (AI prompt editing) |
| Styling | Mantine's CSS + PostCSS (`postcss-preset-mantine`, `postcss-simple-vars`) — no Tailwind, no CSS Modules, no styled-components |
| PDF export | `jspdf` |
| Dates | `dayjs` |

## Networking

| Concern | Choice |
| --- | --- |
| HTTP client | Axios (`src/common/api/client.ts`), single instance, `withCredentials: true` (cookie-based auth) |
| Auth model | Cookie session issued by the backend's `better-auth`; no tokens stored client-side |

## Tooling

| Concern | Choice |
| --- | --- |
| Linting | ESLint 10, flat config, `typescript-eslint` (strict + stylistic type-checked), `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `@tanstack/eslint-plugin-query` |
| Formatting | Prettier 3.8 (no semicolons, single quotes, 100 col width, trailing commas, `arrowParens: always`) |
| Type checking | `tsc -b` (project references: `tsconfig.base` → `tsconfig.app` / `tsconfig.node`) |
| Testing | **None configured** — no Jest/Vitest/Cypress/Playwright present |
| CI/CD | GitHub Actions, triggered on GitHub Release publish; builds and deploys to S3 + CloudFront via OIDC (see `README.md`) |

## Notable architectural choices

- **No `App.tsx`** — TanStack Router's file-based route tree plus `AppRouterProvider` (`src/common/contexts/index.tsx`) serves that role.
- **Route-group layouts for auth**: `_private/` (authenticated, role-gated nav) and `_public/` (login/forgot/reset) use `beforeLoad` guards to redirect rather than a wrapper/HOC pattern.
- **RBAC** enforced in two places: route guards (`requireRole` in `src/common/auth/roles.ts`) and nav-item visibility in the private layout. Roles: `admin`, `analyst`, `user`.
- **Feature-based folder structure** (`src/features/<domain>/components`) alongside a `common/` layer (API clients, auth, pagination, hooks) and a `components/` layer for shared presentational UI — see `ARCHITECTURE.md` for the full layout.
