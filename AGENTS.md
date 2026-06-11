# AGENTS.md

## Current Project Status

This repository is now a v2 authenticated AI Flow workspace product. The original foundation work for auth shell, workspace projects, remote flow drafts, cloud assets, billing reserve/settle/refund, account page, and legacy entry cleanup has been completed. Do not treat the old sprint list as pending work.

Current source-of-truth docs:

- `AGENTS.md` is the primary instruction file for future AI agents.
- `PROJECT_RECORD.md` is the root-level running project record and must be updated after meaningful product, staging, deployment, or infrastructure progress.
- `docs/CODEX_HANDOFF.md` records completed work and current known status.
- `docs/DEVELOPMENT_PLAN.md` is the historical product plan. The root file `DEVELOPMENT_PLAN.md` does not exist.
- `docs/v2-local-development.md` is the local development and QA guide.
- `docs/PRODUCTION_DEPLOYMENT.md`, `docs/PRODUCTION_RUNBOOK.md`, and `docs/staging-runbook.md` are deployment references.
- `docs/AI_GATEWAY_PLUGIN_DEVELOPMENT_PLAN.md` is the current detailed plan for the plugin-style AI Gateway/model integration redesign.
- `docs/AI_GATEWAY_ADMIN_V2_FINAL_VERIFICATION.md` is the final acceptance, deployment, smoke-test, and rollback checklist for the AI Gateway admin upgrade.

When these documents conflict with current code, inspect the current code and choose the safest minimal change that preserves the v2 architecture.

Project record maintenance rule:

- When completing meaningful improvements, staging validations, deployment changes, or operational fixes, update `PROJECT_RECORD.md` in the same task or immediately after.

---

## Product Mission

Keep and improve the v2 product path:

- User login and tenant-aware auth.
- TapNow-style workspace project list.
- One user-facing project has one primary Flow canvas.
- Server-side canvas draft persistence.
- Cloud asset library backed by object storage.
- Billing credits with reserve, settle, refund, usage events, and ledger records.
- AI provider/model/route configuration through the v2 AI Gateway path.

Do not restore old product paths as the main experience:

- Do not mount the old `InfiniteCanvas` as a normal entry.
- Do not restore `/create/classic` or `/create/flow` as primary product routes.
- Do not use browser `localStorage` or IndexedDB as the authoritative canvas or asset store.
- Do not use legacy account/billing/frontend API calls when `/api/v2/*` equivalents exist.
- Do not reintroduce multiple disconnected frontend shells.

---

## Current Architecture

Use the v2 runtime as the main path:

- Frontend: Vite + React.
- Flow canvas: `@xyflow/react`.
- API: `apps/api`.
- Worker: `apps/worker`.
- Database and migrations: `packages/db`.
- Queue/background work: Redis/BullMQ via existing redis packages.
- Object storage: existing S3-compatible storage flow.
- AI Gateway: `packages/ai-gateway-core` plus database-backed providers/models/routes/credentials.

Runtime services in deployment:

- `tapflow-frontend`: serves built Vite `dist` via `scripts/serve-dist.cjs`.
- `tapflow-api`: runs `npm run start:api`.
- `tapflow-worker`: runs `npm run start:worker`.
- `tapflow-redis`: Redis for BullMQ queues.

Postgres is external and provided by `DATABASE_URL`. Object storage is S3-compatible and provided by `S3_*` environment variables.

Prefer existing project conventions and helper APIs. Do not add new production dependencies unless they are clearly needed.

---

## Required Product Routes

Normal user-facing routes:

```txt
/login
/register
/workspace
/projects/:projectId
/assets
/billing
/account
```

Compatibility behavior:

```txt
/                -> authenticated users go to /workspace; anonymous users go to /login
/create/flow     -> redirect to /workspace or a selected project
/create/classic  -> redirect to /workspace
/admin           -> not a normal user-facing route
/model-mapping   -> not a normal user-facing route
```

Admin/model configuration may exist under account/admin paths, but it must remain permission-protected and must not become a normal creator-facing entry unless explicitly requested.

---

## Deployment Rules

The primary server deployment path is Docker Compose v2.

Use:

```txt
Compose file: docker-compose.staging.yml
Server project path: /opt/aittco/tapflow
Server env file: /opt/aittco/env/tapflow.staging.env
Default branch: main
```

Do not use the root `docker-compose.yml` for the current v2 product deployment unless the user explicitly asks for the old legacy/MySQL deployment path. The root `docker-compose.yml` is oriented toward the legacy MySQL app and is not the current v2 deployment entry.

When the user asks how to deploy, update, or restart the server, default to the Docker Compose v2 flow below. Keep the answer practical and do not invent unrelated platform instructions.

```bash
cd /opt/aittco/tapflow
git fetch --all --prune
git pull --ff-only origin main

docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml build

docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml stop tapflow-worker

docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-api node packages/db/dist/cli.js

docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend

docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml ps
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml logs --tail=100 tapflow-api tapflow-worker
```

Important production image rule:

- In the production Docker image, run migrations with `node packages/db/dist/cli.js`.
- Do not tell the user to run `npm run db:migrate` inside the production image unless the image has source TypeScript available. The production image contains compiled `packages/db/dist/cli.js`.

Safe deployment order:

1. Pull latest code.
2. Build images.
3. Stop worker before DB migration to avoid jobs running against changing schema.
4. Run DB migration once.
5. Start Redis/API/worker/frontend.
6. Check service status and logs.

Rollback guidance:

- Prefer redeploying a previous git commit or image.
- Stop worker before rollback if workflow behavior is affected.
- Disable broken AI routes by setting route status to `inactive` instead of deleting historical records.
- Restore DB only when explicitly required and after backup/approval.
- Keep billing ledger immutable where possible.

---

## Environment Variable Rules

The server env file is normally:

```txt
/opt/aittco/env/tapflow.staging.env
```

`--env-file` does not automatically inject every variable into every container. Any variable needed by `tapflow-api` or `tapflow-worker` must be listed in `x-tapflow-env` inside `docker-compose.staging.yml`.

When adding a new provider/model/API integration, update all relevant places:

- `docker-compose.staging.yml`
- `docs/STAGING_ENV_TEMPLATE.md`
- seed or plugin install docs if needed
- deployment notes if the variable is required on the server

Never commit real secrets, API keys, database passwords, JWT secrets, or `CREDENTIAL_MASTER_KEY`.

Provider credentials must stay server-side:

- Prefer CredentialVault-backed `api_credentials` for provider API keys.
- Do not expose raw keys, encrypted secrets, nonces, auth tags, or full Authorization headers to frontend responses, node data, draft JSON, logs, or screenshots.

Important existing provider env examples:

```txt
VISIONARY_API_KEY
VISIONARY_BASE_URL
OPENAI_API_KEY
OPENAI_COMPAT_BASE_URL
OPENAI_BASE_URL
OPENAI_COMPAT_IMAGE_TIMEOUT_MS
```

Only document placeholders in repository files.

---

## Local Development

Use local v2 infrastructure:

```bash
npm install
npm run dev:infra
npm run db:migrate
npm run dev:api
npm run dev:worker
npm run dev
```

Local URLs:

```txt
API: http://localhost:3366
Frontend: http://localhost:5188
Health: http://localhost:3366/health
```

Use `infra/docker-compose.dev.yml` for local v2 infrastructure. Do not use the root `docker-compose.yml` as the v2 local QA path.

Useful scripts:

```bash
npm run build
npm test
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/db
npm run build --workspace @aigc-flow/worker
npm run dev:seed-billing
npm run dev:seed-ai
```

Seed scripts are for local/dev or explicitly approved staging operations only. They are guarded and must not be used casually on production data.

---

## Auth Rules

Use the v2 auth APIs:

```txt
POST /api/v2/auth/register
POST /api/v2/auth/login
POST /api/v2/auth/refresh
POST /api/v2/auth/logout
GET  /api/v2/auth/me
```

Keep token handling centralized in:

```txt
src/services/v2HttpClient.ts
src/services/v2AuthClient.ts
src/auth/AuthProvider.tsx
src/auth/AuthGate.tsx
```

If token refresh fails, clear auth state and return to `/login`.

Do not rely on legacy `/api/auth/*` as the main product path.

---

## Workspace and Canvas Rules

The user-facing concept is:

```txt
one project -> one primary canvas
```

Internally, `project -> flow` may remain for extensibility, but the UI should not expose multiple flows per project unless explicitly designed.

Canvas persistence:

- Use `flow_drafts` for high-frequency autosave.
- Use `flow_versions` for snapshots/history/publish, not high-frequency autosave.
- Persist at minimum:

```ts
{
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
}
```

Do not write these as authoritative data into `flow_drafts.graph_json`:

```txt
base64 media
data: URLs
blob: URLs
File objects
Blob objects
long-lived signed URLs
```

If using revision numbers, return `409` on stale writes and show a clear conflict message.

---

## Asset Rules

Authoritative asset data lives in:

```txt
assets
object storage
```

Canvas node data should persist `assetId` as the source of truth.

Temporary signed URLs and preview URLs are UI conveniences only. They must be recoverable from `assetId`.

Generated outputs must be persisted as `assets` records and appear in `/assets`.

Do not store generated media as base64/blob/data URLs inside canvas graph JSON.

---

## Billing Rules

Billing state changes happen only on the server.

Generation workflow must follow:

```txt
1. estimate cost
2. reserve credits
3. enqueue/run job
4. settle on success
5. refund/release on failure
```

Use idempotency keys for:

```txt
reserve
usage
settle
refund
redeem
payment webhook
admin adjustment
```

Billing UI reads:

```txt
GET /api/v2/billing/summary
GET /api/v2/billing/usage-events
GET /api/v2/billing/ledger
```

The frontend must never directly mutate balances.

Missing pricing must fail closed: return `PRICING_NOT_FOUND` and do not enqueue free execution.

---

## AI Gateway and Model Integration Rules

Current AI Gateway path:

```txt
ai_providers
ai_models
api_credentials
ai_routes
model_pricing
ai_call_logs
packages/ai-gateway-core
apps/worker runtime adapters
```

Provider secrets must be encrypted and server-side only.

When adding or fixing providers/models/routes:

- Keep provider kind aligned with a registered worker adapter.
- Keep route modality, model binding, credential binding, and pricing aligned.
- Keep route keys stable once users may have saved them in node data.
- Do not make frontend model selection show unrelated routes.
- Production should not expose mock routes as normal options.

For the next major model integration redesign, follow:

```txt
docs/AI_GATEWAY_PLUGIN_DEVELOPMENT_PLAN.md
```

The intended direction is plugin-style model packages:

```txt
plugin manifest -> provider/model/route/pricing/ui schema/test -> publish to canvas
```

Admin information architecture must stay consistent:

- Model Center = daily management of product models, lines, default line, pricing, testing, and status
- Provider Connections = management of provider resources, API keys, base URLs, and reusable runtime connections
- Template Library = initialization entry only, not the main daily management surface

When adding new models or providers, keep this split intact. Do not push day-to-day route editing back into Template Library.

Route model semantics:

- Product model display name is what end users see in canvas/model pickers
- Upstream model is what the selected line actually sends to the provider
- Friendly route labels should be user-facing labels like `线路一`, `线路二`
- Provider/vendor names should stay in admin surfaces unless the product explicitly needs to expose them

Migration/backfill expectations:

- Existing `route_key` values must remain stable
- Legacy routes should be backfilled into `connection_id`, `upstream_model`, `api_mode`, and `request_path`
- New template installs should create or update provider connections and write those same normalized route fields

---

## Database Rules

Every new multi-tenant table must include `tenant_id` unless there is a strong documented reason not to.

Add indexes for common tenant-scoped queries.

Add RLS policies using the existing tenant context pattern.

Do not create migrations that assume only one tenant.

Do not store provider secrets, payment secrets, or raw API keys in frontend-visible data.

For production/staging deployment, run migrations before restarting the worker.

---

## Files to Inspect First

App shell and routing:

```txt
App.tsx
src/app/AppRouter.tsx
src/app/WorkspaceShell.tsx
src/app/routes.ts
src/auth/*
```

Workspace, canvas, and assets:

```txt
src/workspace/*
src/flowCanvas/**
src/assets/*
apps/api/src/modules/projects/*
apps/api/src/modules/flows/*
apps/api/src/modules/assets/*
packages/db/migrations/*
```

Billing and workflow:

```txt
src/billing/*
src/services/v2WorkflowRunsApi.ts
apps/api/src/modules/billing/*
apps/api/src/modules/workflow-runs/*
apps/worker/src/workflow-runtime/service.ts
packages/db/src/billing.ts
```

AI Gateway:

```txt
src/account/ProviderSettingsPage.tsx
src/services/v2AiGatewayAdminApi.ts
src/services/v2AiRoutesApi.ts
apps/api/src/modules/ai-gateway/*
packages/ai-gateway-core/src/*
apps/worker/src/main.ts
scripts/dev-seed-ai.ts
```

Deployment:

```txt
docker-compose.staging.yml
Dockerfile
scripts/serve-dist.cjs
docs/staging-runbook.md
docs/PRODUCTION_DEPLOYMENT.md
docs/PRODUCTION_RUNBOOK.md
docs/STAGING_ENV_TEMPLATE.md
```

---

## Validation Commands

For implementation tasks, run at least:

```bash
npm run build
```

When touching backend services, database logic, billing, auth, worker behavior, or AI Gateway runtime, also run relevant tests:

```bash
npm test
npm run test --workspace @aigc-flow/api
npm run test --workspace @aigc-flow/worker
npm run test --workspace @aigc-flow/ai-gateway-core
npm run test --workspace @aigc-flow/db
```

If a command fails because local infrastructure is missing, report the exact failure and what was already validated.

Known historical note: some legacy migration tests may fail independently of the v2 product path. Check `docs/CODEX_HANDOFF.md` before treating legacy migration failures as blockers.

---

## Git and Change Management

There may be unrelated dirty files in the working tree. Do not revert user changes.

Stage only files touched for the current task.

Do not run destructive git commands such as:

```txt
git reset --hard
git checkout -- <path>
```

unless the user explicitly asks for that exact destructive operation.

When the user explicitly asks to push to GitHub:

1. Inspect `git status`.
2. Stage only relevant files.
3. Commit with a concise task-specific message.
4. Push the current branch to the expected remote.
5. Tell the user the commit hash and branch.

Do not combine unrelated refactors with deployment, billing, auth, AI provider, or database changes unless the user explicitly asks.

---

## Definition of Done

A task is not done until:

- The affected main user flow works from the UI when UI behavior changed.
- `npm run build` passes, or the failure is documented with a concrete reason.
- Relevant tests pass, or missing infrastructure is documented.
- New APIs use auth and tenant checks.
- New tables have tenant isolation and RLS where applicable.
- No new browser local persistence is introduced as authoritative storage.
- No secrets are exposed to the frontend.
- Deployment instructions, if requested, follow Docker Compose v2 with `docker-compose.staging.yml`.
- Final response lists changed files, validation commands, and known follow-ups.
