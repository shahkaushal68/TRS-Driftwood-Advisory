# Driftwood TRS Admin Panel

React SPA admin interface for the Driftwood TRS platform.

**Stack:** React 19 · TypeScript · Vite · Mantine UI · TanStack Router · TanStack Query · Zustand · Axios

**Live URL:** `https://driftwood-trs-dev-admin.godatanova.com`

**Docs:** [`TECH_STACK.md`](./TECH_STACK.md) (full dependency list) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) (folder structure & code organization)

---

## Table of Contents

1. [Local Development](#local-development)
2. [Infrastructure Overview](#infrastructure-overview)
3. [Playbooks](#playbooks)
   - [First-Time Setup](#1-first-time-setup-run-once-per-environment)
   - [Routine Deployment](#2-routine-deployment)
   - [Adding or Changing the Custom Domain](#3-adding-or-changing-the-custom-domain)
4. [Script Reference](#script-reference)
5. [AWS Resources](#aws-resources)
6. [Deploy Pipeline](#deploy-pipeline)

---

## Local Development

```bash
npm install
npm run dev        # starts Vite dev server (http://localhost:5173)
npm run typecheck  # TypeScript project references check
npm run lint       # ESLint (warnings = failure)
npm run format:check  # Prettier formatting check
npm run check      # typecheck + lint + format:check in one shot
```

The dev server connects to the dev API at `https://driftwood-trs-dev-api.godatanova.com` via `.env.development`. To override locally, set `VITE_PUBLIC_SERVER_URL` in `.env.development.local`.

### AI Analysis Display

The AI review result is fetched from `GET /analyst/documents/:id/ai-analysis` and rendered in `AiAnalysisPanel` inside `src/features/documents/components/AnalystDocumentDrawer.tsx`.

**Storage model:** The entire AI response is one JSON blob (`rawOutput`). There are no individual DB columns per section — the UI reads known keys from `rawOutput` and renders whichever are present. This means the AI prompt can be updated without a DB migration.

**11 sections rendered by `AiAnalysisPanel`:**

| Section key                       | Display                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `reviewHeader`                    | Domain, category, evidence type, generation timestamp                          |
| `topLevelAssessment`              | Color badge (Green/Yellow/Red), confidence rating, recommended action          |
| `executiveSummary`                | Plain text                                                                     |
| `documentQualityReview`           | Plain text                                                                     |
| `systemOfRecordReadinessFindings` | Bulleted list with checkmark icons                                             |
| `systemOfRecordCoverageReview`    | Plain text                                                                     |
| `evidenceGaps`                    | Bulleted list with warning icons                                               |
| `humanValidationQuestions`        | Numbered list in italic — only shown when AI can't fully determine sufficiency |
| `suggestedNextSteps`              | Numbered list                                                                  |
| `draftAnalystFinding`             | Highlighted block — AI-drafted text the analyst can adopt or edit              |
| `limitationsAndUncertainties`     | Dimmed italic text                                                             |

**Editing:** The analyst can edit any section in-form. On save the entire `rawOutput` object is sent to `PATCH /analyst/documents/:id/ai-analysis` — always as a full replacement, never a partial patch. The TypeScript shape is defined in `src/common/api/documents.ts` (`AiRawOutput` interface).

---

## Infrastructure Overview

This is a static SPA — there is no server. The built output is uploaded to an S3 bucket and served globally via CloudFront. S3 is never publicly accessible; CloudFront reaches it through an Origin Access Control (OAC) policy.

```
GitHub Release
      │
      ▼
GitHub Actions (OIDC — no stored keys)
      │  npm ci + vite build --mode development
      │  aws s3 sync dist/ → S3 bucket
      │  cloudfront create-invalidation /*
      ▼
S3 bucket (private): driftwood-trs-dev-admin
      │  OAC — only CloudFront can read objects
      ▼
CloudFront distribution
  ├─ Hashed assets: max-age=31536000,immutable  (1-year browser cache)
  ├─ index.html:    no-cache,no-store           (always fresh)
  ├─ 403/404 → index.html (SPA client-side routing)
  └─ HTTP → HTTPS redirect (viewer protocol policy)
      │
Cloudflare CNAME → CloudFront domain
(driftwood-trs-dev-admin.godatanova.com)
```

> **SPA routing note:** CloudFront serves `index.html` for all 403/404 responses. This allows TanStack Router to handle client-side routes — a direct browser load of `/users/123` works correctly.

---

## Playbooks

These are the ordered sequences you follow for each real-world scenario. Read the script reference below for individual flag details.

---

### 1. First-Time Setup (run once per environment)

This is the full sequence to go from nothing to a live, working admin panel. Each step is a hard prerequisite for the next.

#### Prerequisites

- AWS CLI v2 installed and configured with Admin permissions
- Verify: `aws sts get-caller-identity`
- `python3` available (pre-installed on macOS; required by `setup-domain.sh`)
- Git remote `origin` pointing to your GitHub repository (required for the OIDC trust policy)

#### Step 1 — Provision AWS infrastructure

Creates all resources in order: S3 bucket → CloudFront OAC → CloudFront distribution → S3 bucket policy → GitHub OIDC provider → GitHub deploy IAM role.

```bash
./scripts/setup-aws.sh
```

At the end, the script prints **4 GitHub repository variables** you must set in the next step. Copy them.

> The CloudFront distribution takes **5–10 minutes** to finish propagating after creation. You can continue to Step 2 while it deploys.

#### Step 2 — Set GitHub repository variables

Go to **GitHub → Settings → Secrets and variables → Actions → Variables** and set all 4 values printed by the previous step:

| Variable                     | Value                                                                  |
| ---------------------------- | ---------------------------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN`        | `arn:aws:iam::250758375895:role/driftwood-trs-dev-admin-github-deploy` |
| `AWS_REGION`                 | `us-east-1`                                                            |
| `S3_BUCKET_NAME`             | `driftwood-trs-dev-admin`                                              |
| `CLOUDFRONT_DISTRIBUTION_ID` | (printed by `setup-aws.sh`)                                            |

#### Step 3 — Publish the first GitHub Release

Go to **GitHub → Releases → Draft a new release**. Create a tag following semver (e.g. `v1.0.0`) and click **Publish release**. GitHub Actions will:

1. Check out the tagged commit
2. Run `npm ci`
3. Build with `npx vite build --mode development` (loads `.env.development` — the dev API URL)
4. Upload hashed assets to S3 with 1-year immutable cache headers
5. Upload `index.html` with no-cache headers
6. Invalidate the CloudFront cache (`/*`)

Watch the deploy in **GitHub → Actions**. Once the workflow is green, the site is live at the CloudFront `*.cloudfront.net` URL printed during setup.

#### Step 4 — Add a custom domain (optional but standard)

```bash
./scripts/setup-domain.sh --domain driftwood-trs-dev-admin.godatanova.com
```

The script will pause and print a CNAME for ACM DNS validation. Add it in Cloudflare as **DNS-only (gray cloud — not proxied)**. The script polls every 15 seconds until the certificate is issued, then attaches the alias and certificate to the CloudFront distribution.

> **ACM region note:** CloudFront requires ACM certificates to be provisioned in `us-east-1` regardless of where the S3 bucket lives. The script always uses `us-east-1` for ACM — do not change this.

CloudFront takes another **~5 minutes** to propagate the domain update after the script finishes.

#### Step 5 — Point DNS to CloudFront

In Cloudflare, add a CNAME record:

- **Name:** your subdomain (e.g. `driftwood-trs-dev-admin`)
- **Content:** the CloudFront `*.cloudfront.net` domain printed by `setup-aws.sh` or `setup-domain.sh`
- **Proxy:** ON (orange cloud) or OFF (gray cloud) — both work. Orange cloud means Cloudflare also caches and protects the traffic; gray cloud means DNS-only passthrough to CloudFront.

---

### 2. Routine Deployment

After initial setup, all deploys happen through GitHub Releases. There is no auto-deploy on every push.

```
GitHub → Releases → Draft a new release → publish
```

Use semver tags: `v1.2.3` for stable releases, `v1.2.3-beta.1` for pre-releases.

**What the deploy does:**

1. Builds the app against `.env.development` (the dev API URL)
2. Syncs `dist/` to S3 with `--delete` (removes files no longer in the build output)
3. Hashed asset files (JS, CSS, images) get `max-age=31536000,immutable` — browsers cache them for up to 1 year
4. `index.html` gets `no-cache,no-store,must-revalidate` — browsers always fetch the latest version
5. Invalidates `/*` on CloudFront so edge caches fetch the new `index.html` immediately

**Manual re-deploy (same tag, no code change):**

```
GitHub → Actions → Deploy → Run workflow → enter existing tag (e.g. v1.2.3)
```

---

### 3. Adding or Changing the Custom Domain

Run this any time you need to attach a new domain or replace an existing one:

```bash
./scripts/setup-domain.sh --domain your-new-domain.com
```

The script is idempotent — if a valid certificate already exists for the domain, it skips the ACM request and goes straight to attaching it to the distribution.

After the script finishes:

- Update your Cloudflare DNS CNAME to point the new domain to the CloudFront `*.cloudfront.net` address
- Remove the old CNAME if you are replacing an existing domain

---

## Script Reference

Both scripts live in `scripts/` and are safe to re-run (idempotent).

---

### `setup-aws.sh`

Provisions the complete AWS infrastructure for the admin panel from scratch. Safe to re-run — existing resources are detected and skipped; the S3 bucket policy and IAM deploy policy are always upserted to stay current.

```bash
./scripts/setup-aws.sh
```

Creates in order:

1. **S3 bucket** — private (public access fully blocked); this is the only storage for built assets
2. **CloudFront OAC** (Origin Access Control) — allows CloudFront to read from the private S3 bucket using SigV4 signing; no legacy OAI
3. **CloudFront distribution** — SPA-configured: default root object `index.html`, 403/404 → `index.html`, HTTP redirect to HTTPS, HTTP/2+3, managed caching policy
4. **S3 bucket policy** — grants `s3:GetObject` only to the specific CloudFront distribution via OAC; no other principal can read the bucket
5. **GitHub OIDC provider** — keyless auth so GitHub Actions can assume an IAM role without stored credentials; skipped if the provider already exists from another project setup
6. **GitHub deploy IAM role** — grants `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on the bucket, and `cloudfront:CreateInvalidation` on the distribution

**Prerequisites:**

- AWS CLI v2 with Admin permissions
- `git remote origin` pointing to GitHub (used to generate the OIDC trust policy)

**When to use:** once, when setting up a new environment. Not a deployment tool — use a GitHub Release for that.

---

### `setup-domain.sh`

Attaches a custom domain to the CloudFront distribution with a valid ACM TLS certificate. Safe to re-run — reuses an already-issued certificate and skips re-attaching an alias that is already present.

```bash
./scripts/setup-domain.sh --domain your-domain.com
```

What it does:

1. Looks up the CloudFront distribution by the internal comment `driftwood-trs-dev-admin`
2. Requests an ACM certificate in `us-east-1` (CloudFront's required region for certificates)
3. Prints the CNAME validation record — add it in your DNS provider as **DNS-only (gray cloud)**, not proxied
4. Polls every 15 seconds until the certificate is issued; press Ctrl+C to abort and re-run later
5. Fetches the current distribution config (including its ETag for optimistic locking), splices in the alias and certificate using `python3`, and calls `UpdateDistribution`

| Flag       | Default    | Description                           |
| ---------- | ---------- | ------------------------------------- |
| `--domain` | (required) | Custom domain to attach to CloudFront |

**Prerequisites:**

- `setup-aws.sh` must have been run first (the CloudFront distribution must exist)
- `python3` must be available
- AWS CLI v2 with Admin permissions

**When to use:** once during initial setup, or any time you are adding or changing the custom domain. Do not run this as part of routine deploys.

---

## AWS Resources

| Resource                | Name / ID                               |
| ----------------------- | --------------------------------------- |
| S3 bucket               | `driftwood-trs-dev-admin`               |
| CloudFront OAC          | `driftwood-trs-dev-admin-oac`           |
| CloudFront distribution | (ID printed by `setup-aws.sh`)          |
| ACM certificate         | (ARN printed by `setup-domain.sh`)      |
| IAM GitHub deploy role  | `driftwood-trs-dev-admin-github-deploy` |

### IAM Role

| Role            | Used by        | Purpose                                              |
| --------------- | -------------- | ---------------------------------------------------- |
| `github-deploy` | GitHub Actions | Sync built assets to S3, invalidate CloudFront cache |

---

## Deploy Pipeline

Deployments are **triggered exclusively by publishing a GitHub Release** (including pre-releases). There is no auto-deploy on every push.

### How it works

The GitHub Actions workflow (`.github/workflows/deploy.yml`) does the following on each release:

| Step                  | Detail                                                                          |
| --------------------- | ------------------------------------------------------------------------------- |
| Checkout              | Checks out the exact release tag                                                |
| Install               | `npm ci` with Node 24 cache                                                     |
| Build                 | `npm run typecheck && npx vite build --mode development`                        |
| AWS auth              | OIDC — no stored access keys; assumes the `github-deploy` IAM role              |
| Upload assets         | `aws s3 sync dist/ s3://... --delete` — hashed files get 1-year immutable cache |
| Upload index.html     | Separate step with `no-cache` headers so it is always re-fetched                |
| Invalidate CloudFront | `cloudfront create-invalidation --paths "/*"` — clears edge caches immediately  |

### Build mode note

The build runs with `--mode development`, which loads `.env.development` (not `.env.production`). This is intentional — **there is currently only one deployed environment**, and `.env.development` contains the live dev API URL. Do not confuse this with running in development mode locally; Vite still produces a fully optimised production bundle.

### Concurrency

The workflow has `cancel-in-progress: false` — a second deploy queues behind the first instead of cancelling it. Two deploys never run simultaneously.
