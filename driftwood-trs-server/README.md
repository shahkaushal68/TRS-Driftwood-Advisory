# Driftwood TRS Server

NestJS REST API server for the Driftwood TRS platform.

**Stack:** NestJS · TypeScript · Drizzle ORM · PostgreSQL (AWS RDS) · Redis (Upstash) · better-auth

**Live URL:** `https://driftwood-trs-dev-api.godatanova.com`

**Docs:** [`TECH_STACK.md`](./TECH_STACK.md) (full dependency list) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) (module layout & API route reference)

---

## Table of Contents

1. [Local Development](#local-development)
2. [Infrastructure Overview](#infrastructure-overview)
3. [Playbooks](#playbooks)
   - [First-Time Setup](#1-first-time-setup-run-once-per-environment)
   - [Routine Deployment](#2-routine-deployment)
   - [Updating Environment Variables](#3-updating-environment-variables)
   - [Seeding the Super-Admin](#4-seeding-the-super-admin)
4. [Script Reference](#script-reference)
5. [AWS Resources](#aws-resources)
6. [Secrets Management](#secrets-management)
7. [Docker](#docker)

---

## Local Development

```bash
npm install
npm run start:dev
```

> Requires a `.env.development.local` file with the required values. Ask a teammate or copy from the Secrets Manager secret (`driftwood-trs-dev`).

The server starts on `http://localhost:8000`. Health check: `GET /api/health`.

### Database

```bash
npm run db:generate   # generate migration files from schema changes
npm run db:migrate    # apply pending migrations locally
npm run db:studio     # open Drizzle Studio (visual DB browser)
```

Migrations run automatically at container startup in production — no manual step needed after a deploy.

### AI Analysis Storage

The AI review result for each document is stored in the `ai_analysis` table as a **single `raw_output` jsonb column** — not as individual columns per section.

**Why:** The AI prompt can change at any time. Storing the entire response as JSON means the DB schema never needs a migration when the output structure evolves.

**Two columns are kept separate** because they drive server-side logic:

| Column          | Purpose                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ai_verdict`    | Analyst-confirmed verdict (`pass` / `review` / `failed`). Kept separate so the server can filter on it without parsing jsonb. |
| `report_status` | `draft` or `published`. Controls visibility to the document owner.                                                            |

**Shape:** Defined by the `AiRawOutput` interface in `src/db/schema/documents.ts`. The interface is the contract between the AI job, the API, and the frontend — it is not enforced at the DB level.

**Updating:** `PATCH /analyst/documents/:id/ai-analysis` accepts `{ rawOutput?: AiRawOutput, aiVerdict?: string }`. `rawOutput` is always replaced wholesale — the server does not merge individual fields.

---

## Infrastructure Overview

```
GitHub Release
      │
      ▼
GitHub Actions (OIDC — no stored keys)
      │  build Docker image
      │  push to ECR
      │  rolling deploy to ECS
      ▼
Amazon ECR  ──────────────────────────────────────────────────────────┐
                                                                       │ pull image
Amazon ECS Fargate (cluster: driftwood-trs-dev)                        │
  └─ Service: driftwood-trs-dev (1 task, awsvpc networking)  ◄─────────┘
       └─ Container: driftwood-trs-dev (port 8000)
            │  1. fetch secrets from Secrets Manager
            │  2. run Drizzle migrations
            │  3. start app
            ▼
AWS Secrets Manager (secret: driftwood-trs-dev)
            │
Application Load Balancer (driftwood-trs-dev-alb)
  ├─ Port 80  → forward to target group (or redirect → 443)
  └─ Port 443 → forward to target group (ACM cert)
            │
Cloudflare  (driftwood-trs-dev-api.godatanova.com → ALB, SSL proxy)
```

---

## Playbooks

These are the ordered sequences you follow for each real-world scenario. Read the script reference below for individual flag details.

---

### 1. First-Time Setup (run once per environment)

This is the full sequence to go from nothing to a live, working API. **Each step is a hard prerequisite for the next.** Do not skip ahead.

#### Prerequisites

- AWS CLI v2 installed and configured with Admin permissions
- Verify: `aws sts get-caller-identity`
- Git remote `origin` pointing to your GitHub repository (required for the OIDC trust policy in step 3)
- `.env.development.local` populated with all required values, including `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, and `SUPER_ADMIN_NAME`

#### Step 1 — Upload secrets to AWS Secrets Manager

The secrets must exist in Secrets Manager **before** the AWS infrastructure is provisioned, because `setup-aws.sh` creates an IAM policy that grants the ECS task role access to the specific secret ARN.

```bash
./scripts/upload-secrets.sh
```

Preview what will be uploaded first if you want to verify:

```bash
./scripts/upload-secrets.sh --dry-run
```

#### Step 2 — Provision AWS infrastructure

Creates all AWS resources in order: ECR → OIDC provider → IAM roles → CloudWatch → ECS cluster → VPC/subnets → security groups → ALB → ECS task definition → ECS service.

```bash
./scripts/setup-aws.sh
```

At the end, the script prints **7 GitHub repository variables** you must set in the next step. Copy them.

> The ECS service will be in PENDING state after this — that is expected. It has no image yet.

#### Step 3 — Set GitHub repository variables

Go to **GitHub → Settings → Secrets and variables → Actions → Variables** and set all 7 values printed by the previous step:

| Variable              | Value                                                            |
| --------------------- | ---------------------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::250758375895:role/driftwood-trs-dev-github-deploy` |
| `AWS_REGION`          | `us-east-1`                                                      |
| `ECR_REPO_NAME`       | `driftwood-trs-dev`                                              |
| `ECS_CLUSTER`         | `driftwood-trs-dev`                                              |
| `ECS_SERVICE`         | `driftwood-trs-dev`                                              |
| `ECS_TASK_FAMILY`     | `driftwood-trs-dev`                                              |
| `ECS_CONTAINER_NAME`  | `driftwood-trs-dev`                                              |

#### Step 4 — Add HTTPS

```bash
./scripts/setup-https.sh --domain your-domain.com --redirect-http
```

The script will pause and print a CNAME record for ACM DNS validation. Add it in your DNS provider as **DNS-only (gray cloud — not proxied)**. The script will poll until the certificate is issued, then configure the HTTPS listener automatically.

#### Step 5 — Point DNS to the ALB

In Cloudflare, add a CNAME record:

- **Name:** your subdomain (e.g. `driftwood-trs-dev-api`)
- **Content:** the ALB DNS name printed by `setup-aws.sh`
- **Proxy:** ON (orange cloud) — Cloudflare terminates SSL; traffic from Cloudflare to the ALB travels over HTTP, which is fine

#### Step 6 — Publish the first GitHub Release

Go to **GitHub → Releases → Draft a new release**. Create a tag following semver (e.g. `v1.0.0`) and click **Publish release**. GitHub Actions will:

1. Build the Docker image with semver tags (`:1.0.0`, `:1.0`, `:1`, `:latest`)
2. Push to ECR
3. Register a new ECS task definition with the updated image URI
4. Roll out a new ECS deployment with automatic rollback on failure
5. Wait for the service to stabilise before marking the workflow green

Watch the deploy in **GitHub → Actions**. Watch the service health in **AWS Console → ECS → driftwood-trs-dev cluster → driftwood-trs-dev service**.

**Do not proceed to the next step until the GitHub Actions workflow is green and the ECS service shows 1/1 running tasks.**

#### Step 7 — Seed the super-admin

> **Hard prerequisite:** the ECS service must have a live, running container before this step. The seed command runs as a one-off ECS task using the same Docker image. If no image has been deployed yet, there is nothing to run.

```bash
./scripts/seed.sh --production
```

This spins up a one-off ECS task, fetches secrets from Secrets Manager (including `SUPER_ADMIN_*`), runs any pending migrations, executes the seed script, then exits. The script waits for the task to finish and prints a CloudWatch log URL if you need to debug.

The script is idempotent — re-running it is safe. If the super-admin already exists, it promotes the user or skips.

---

### 2. Routine Deployment

After the initial setup, all deployments happen through GitHub Releases. There is no auto-deploy on every push.

```
GitHub → Releases → Draft a new release → publish
```

Use semver tags: `v1.2.3` for stable releases, `v1.2.3-beta.1` for pre-releases.

**Manual re-deploy (same image, no code change):**

```
GitHub → Actions → Deploy → Run workflow → enter existing tag (e.g. v1.2.3)
```

---

### 3. Updating Environment Variables

Use this any time you change a value in `.env.development` and need it live immediately, without a full code deploy.

```bash
./scripts/refresh-env.sh
```

This does two things in sequence:

1. Uploads `.env.development` to Secrets Manager (overwrites the existing secret)
2. Forces a new ECS deployment so the running container is replaced with one that fetches the updated secret at startup

The script waits for the service to stabilise by default. Pass `--no-wait` to trigger the deployment and return immediately.

```bash
# Trigger and return immediately
./scripts/refresh-env.sh --no-wait

# Preview what would be uploaded without touching AWS
./scripts/refresh-env.sh --dry-run
```

> **Note:** if you only want to update secrets without restarting the container, use `upload-secrets.sh` directly. The updated values will be picked up on the next container restart (next deploy or manual restart).

---

### 4. Seeding the Super-Admin

**This only works after a successful deployment is live.** The seed command runs inside a one-off ECS task using the same image as the running service. There must be a pushed image in ECR and a healthy ECS service before this will work.

**Production (normal use):**

```bash
./scripts/seed.sh --production
```

Credentials (`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME`) are fetched from Secrets Manager at runtime. No flags needed — they live in the same secret blob uploaded via `upload-secrets.sh`.

**Local (connecting directly to a local Postgres instance):**

```bash
# Reads SUPER_ADMIN_* and DATABASE_URL from .env.development.local
./scripts/seed.sh
```

---

## Script Reference

All scripts live in `scripts/` and are safe to re-run (idempotent unless otherwise noted).

---

### `upload-secrets.sh`

Reads a `.env` file, converts it to a JSON blob, and creates or updates an AWS Secrets Manager secret. This is the source of truth for all production environment variables.

```bash
# Default: reads .env.development, writes to secret 'driftwood-trs-dev'
./scripts/upload-secrets.sh

# Preview the JSON that would be uploaded — no AWS calls
./scripts/upload-secrets.sh --dry-run

# Custom source file
./scripts/upload-secrets.sh --env-file .env.staging

# Custom secret name
./scripts/upload-secrets.sh --secret-name my-service-dev
```

| Flag            | Default             | Description                         |
| --------------- | ------------------- | ----------------------------------- |
| `--env-file`    | `.env.development`  | Source `.env` file to read          |
| `--secret-name` | `driftwood-trs-dev` | Secrets Manager secret name         |
| `--region`      | `us-east-1`         | AWS region                          |
| `--dry-run`     | off                 | Print JSON and exit, no AWS changes |

**When to use:** before running `setup-aws.sh` for the first time, or any time you change environment variables (use `refresh-env.sh` if you want the container restarted immediately after).

---

### `setup-aws.sh`

Provisions the complete AWS infrastructure for the service from scratch. Safe to re-run — existing resources are detected and skipped; IAM policies are always upserted to stay current.

```bash
./scripts/setup-aws.sh
```

Creates in order: ECR → GitHub OIDC provider → 3 IAM roles → CloudWatch log group → ECS cluster → security groups → ALB + target group + HTTP listener → ECS task definition → ECS service.

**Prerequisites:**

- AWS CLI v2 with Admin permissions
- `upload-secrets.sh` must have been run first (the IAM task role policy references the secret ARN)
- `git remote origin` must point to GitHub (used to generate the OIDC trust policy for the GitHub deploy role)

**When to use:** once, when setting up a new environment. Do not run this mid-deployment to fix something — it is infrastructure provisioning, not a deployment tool.

---

### `setup-https.sh`

Adds or updates HTTPS on the ALB. Run after `setup-aws.sh`. Safe to re-run — updates the certificate on an existing HTTPS listener rather than creating a duplicate.

```bash
# Add HTTPS only
./scripts/setup-https.sh --domain api.example.com

# Add HTTPS and redirect HTTP port 80 → HTTPS
./scripts/setup-https.sh --domain api.example.com --redirect-http
```

What it does:

1. Requests an ACM certificate (DNS validation)
2. Prints the CNAME record to add for validation — add it as **DNS-only (gray cloud)**, not proxied
3. Polls until the certificate is issued (checks every 15s; press Ctrl+C to abort and re-run later)
4. Opens port 443 on the ALB security group
5. Creates the HTTPS listener — or swaps the certificate if one exists
6. Optionally updates the HTTP listener to redirect to HTTPS

| Flag              | Default     | Description                                      |
| ----------------- | ----------- | ------------------------------------------------ |
| `--domain`        | (required)  | Domain name for the ACM certificate              |
| `--redirect-http` | off         | Reconfigure port 80 listener to redirect → HTTPS |
| `--region`        | `us-east-1` | AWS region                                       |

**Prerequisite:** `setup-aws.sh` must have already created the ALB.

**When to use:** once during initial setup, or any time you change the domain.

---

### `refresh-env.sh`

Uploads `.env.development` to Secrets Manager and forces a new ECS deployment in a single command. Use this whenever you change environment variables and want them live without a full code deploy.

```bash
# Upload secrets and restart container, wait for stability
./scripts/refresh-env.sh

# Trigger restart and return immediately without waiting
./scripts/refresh-env.sh --no-wait

# Preview what would be uploaded, skip all AWS calls
./scripts/refresh-env.sh --dry-run

# Upload a different env file (e.g. staging)
./scripts/refresh-env.sh --env-file .env.staging
```

| Flag            | Default             | Description                                 |
| --------------- | ------------------- | ------------------------------------------- |
| `--env-file`    | `.env.development`  | Source `.env` file                          |
| `--secret-name` | `driftwood-trs-dev` | Secrets Manager secret name                 |
| `--region`      | `us-east-1`         | AWS region                                  |
| `--no-wait`     | off                 | Trigger deployment and exit without waiting |
| `--dry-run`     | off                 | Print what would change, no AWS calls       |

Internally, this calls `upload-secrets.sh` and then `aws ecs update-service --force-new-deployment`.

---

### `seed.sh`

Seeds the initial super-admin user. Credentials are read from either `.env.development.local` (local) or Secrets Manager (production). The script is idempotent — re-running it promotes an existing user or skips if the super-admin already exists.

```bash
# Local — reads SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME, DATABASE_URL from .env.development.local
./scripts/seed.sh

# Production — runs as a one-off ECS task; credentials fetched from Secrets Manager
./scripts/seed.sh --production
```

| Flag           | Default             | Description                                                                       |
| -------------- | ------------------- | --------------------------------------------------------------------------------- |
| `--production` | off                 | Run as an ECS task instead of locally                                             |
| `--cluster`    | `driftwood-trs-dev` | ECS cluster name                                                                  |
| `--service`    | `driftwood-trs-dev` | ECS service name (used to look up the current task definition and network config) |
| `--region`     | `us-east-1`         | AWS region                                                                        |

**Production mode — hard prerequisites (all must be true before running):**

1. `upload-secrets.sh` has been run and `SUPER_ADMIN_*` values are in Secrets Manager
2. `setup-aws.sh` has been run (ECS cluster, service, and task definition exist)
3. A GitHub Release has been published and the deploy workflow completed successfully
4. The ECS service has at least one running, healthy task

If these are not met, the one-off ECS task will fail to start or will exit with an error. Check the CloudWatch log URL printed by the script if you need to debug.

---

### `fetch-aws-secrets.mjs`

Runtime script embedded in the Docker image. Called by `docker-entrypoint.sh` at container startup to fetch secrets from Secrets Manager and inject them as environment variables before migrations and the app run.

**Do not run this manually.** It has no interactive use. See [Secrets Management](#secrets-management) for how it fits into the startup sequence.

---

## AWS Resources

| Resource                | Name / ID                                                     |
| ----------------------- | ------------------------------------------------------------- |
| ECR repository          | `driftwood-trs-dev`                                           |
| ECS cluster             | `driftwood-trs-dev`                                           |
| ECS service             | `driftwood-trs-dev`                                           |
| ALB                     | `driftwood-trs-dev-alb`                                       |
| ALB DNS                 | `driftwood-trs-dev-alb-954981736.us-east-1.elb.amazonaws.com` |
| Target group            | `driftwood-trs-dev-tg`                                        |
| Secrets Manager secret  | `driftwood-trs-dev`                                           |
| CloudWatch log group    | `/ecs/driftwood-trs-dev`                                      |
| ALB security group      | `driftwood-trs-dev-alb-sg`                                    |
| ECS security group      | `driftwood-trs-dev-ecs-sg`                                    |
| IAM task-execution role | `driftwood-trs-dev-task-execution`                            |
| IAM task role           | `driftwood-trs-dev-task-role`                                 |
| IAM GitHub deploy role  | `driftwood-trs-dev-github-deploy`                             |

### IAM Roles

| Role             | Used by           | Purpose                                                   |
| ---------------- | ----------------- | --------------------------------------------------------- |
| `task-execution` | ECS control plane | Pull image from ECR, write logs to CloudWatch             |
| `task-role`      | Running container | Fetch secret from Secrets Manager at startup              |
| `github-deploy`  | GitHub Actions    | Push to ECR, register task definition, update ECS service |

---

## Secrets Management

All environment variables are stored as a **single JSON blob** in AWS Secrets Manager under the secret name `driftwood-trs-dev`. At container startup, `docker-entrypoint.sh` fetches the secret and injects every key as an environment variable before migrations and the app run.

### How secrets reach the container

```
Secrets Manager (JSON blob: driftwood-trs-dev)
        │
        │  fetched at container startup
        │  by scripts/fetch-aws-secrets.mjs
        │  using the ECS task role (no keys required)
        ▼
docker-entrypoint.sh  evals the export statements
        │
        │  runs Drizzle migrations
        │  (node dist/db/migrate.js)
        ▼
node dist/main  (all env vars set, schema up to date)
```

`fetch-aws-secrets.mjs` is a zero-dependency Node.js script. It signs requests with SigV4 using only Node built-ins and supports the full AWS credential chain: explicit env vars → ECS task role → EKS/IRSA → EC2 IMDSv2.

---

## Docker

Three-stage build to keep the production image small:

| Stage     | Purpose                                                            |
| --------- | ------------------------------------------------------------------ |
| `deps`    | Install production-only `node_modules`                             |
| `builder` | Install all deps, compile TypeScript                               |
| `runner`  | Copy compiled output + prod modules, run as non-root `nestjs` user |

The container listens on **port 8000** and has a built-in healthcheck at `GET /api/health`.
