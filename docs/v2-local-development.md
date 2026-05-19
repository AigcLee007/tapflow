# TapFlow v2 Local Development & Manual QA Guide

## 1. Prerequisites

Before starting local development or manual QA, make sure the following are available:

- Node.js 20+
- Docker Desktop or an equivalent Docker environment
- `npm install` completed in the repository root
- Local ports `5432`, `6379`, `9000`, `9001`, `3366`, and `5188` are not occupied

Install dependencies from the repository root:

```bash
npm install
```

## 2. Local Infrastructure

The v2 local runtime uses:

- PostgreSQL
- Redis
- MinIO

Start local infrastructure with:

```bash
npm run dev:infra
```

This command uses:

- `infra/docker-compose.dev.yml`

Do not use the repository root `docker-compose.yml` as the primary path for this v2 manual QA flow. That compose file is still oriented toward legacy or older deployment paths.

## 3. MinIO Setup

On first local startup, create the MinIO bucket manually.

- Console: `http://localhost:9001`
- User: `minio`
- Password: `minio123456`
- Bucket: `aigc-flow-dev`

If the bucket does not exist, the `/assets` upload flow may fail during the presigned upload or complete-upload sequence.

## 4. Environment Variables

Use the following file as the primary reference for v2 local setup:

- `.env.v2.example`

Key variables:

- `NODE_ENV`
- `DATABASE_URL`
- `REDIS_URL`
- `QUEUE_PREFIX`
- `WORKER_CONCURRENCY`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CREDENTIAL_MASTER_KEY`
- `CREDENTIAL_KEY_VERSION`

Important notes:

- Vite reads environment files from the repository root.
- The API, worker, and database migration Node processes may also require the same variables to be explicitly exported in the current shell session.
- The API default port is `3366`.
- The Vite proxy may otherwise default to `3355`.
- For local development, explicitly set `PORT=3366` to avoid the frontend `/api` proxy pointing to the wrong backend port.

Recommended local values are already documented in `.env.v2.example`.

## 5. Database Migration

Run v2 PostgreSQL migrations with:

```bash
npm run db:migrate
```

`DATABASE_URL` must be visible in the current shell when this command runs.

## 6. Start Services

Start the v2 API:

```bash
npm run dev:api
```

Start the v2 worker:

```bash
npm run dev:worker
```

Start the frontend:

```bash
npm run dev
```

Runtime URLs:

- API: `http://localhost:3366`
- Frontend: `http://localhost:5188`
- API health check: `http://localhost:3366/health`

## 7. Manual QA Checklist

Recommended validation order is listed below.

### Auth

- Register a new user
- Log in with the new account
- Open `/account`
- Verify the page shows current `user`, `tenant`, `roles`, and `permissions`
- Log out and confirm navigation returns to `/login`
- Refresh the page and confirm the logged-out state is preserved

### Workspace

- Open `/workspace`
- Verify the project list loads
- Create a new project
- Verify the default flow is created automatically
- Confirm the app navigates to `/projects/:projectId`

### Remote Flow Drafts

- Open the project canvas
- Add a node
- Wait until autosave reaches the `saved` state
- Refresh the page and confirm the node still exists
- Open the same project in a new tab and confirm the same node is visible there

### Asset Library

- Open `/assets`
- Upload an image
- Refresh the page and confirm the asset still exists
- Open the asset preview
- Insert the asset into a project canvas
- Refresh the project canvas and confirm the asset node still exists
- Set the asset as the project cover
- Return to `/workspace` and confirm the project cover is updated

### Billing

- Open `/billing`
- Verify `summary`, `usage`, and `ledger` load correctly
- Seed local QA billing data when the page is empty:

  ```powershell
  $env:NODE_ENV="development"
  npm run dev:seed-billing -- --email your-user@example.com --code QA-REDEEM-1000
  ```

- Refresh `/billing` and verify:
  - balance is non-zero
  - ledger includes `admin_credit`, `settle`, `reserve`, and `refund`
  - usage includes the seeded usage event
- Run the redeem code flow with the seeded code (for example `QA-REDEEM-1000`)
- Verify duplicate redemption attempts for the same code are blocked

Local seed notes:

- `npm run dev:seed-billing` is intended for local development QA only.
- The script is guarded so it only runs when `NODE_ENV=development` or `DEV_SEED_ENABLED=true`.
- It does not register any production API and does not simulate a completed real payment.
- It creates a development redeem code, sample balance, sample usage, and sample ledger activity for the target tenant.

### Workflow Billing

Preparation requirements:

- The user has available balance
- The tenant has a usable provider, model, route, and credential configured
- `model_pricing` contains matching pricing data
- The worker is running

AI provider/model/route/credential setup notes (local QA):

- Use local AI seed for tenant-scoped mock provider baseline:

  ```powershell
  $env:NODE_ENV="development"
  npm run dev:seed-ai -- --email your-user@example.com
  ```

- This seed creates a local mock provider/model/credential/route baseline:
  - provider key: `mock-local-dev`
  - route keys: `image.default`, `image.fail`, `video.default`
  - encrypted credential stored in `api_credentials` (server-side only)
  - mock route pricing rows in `model_pricing`
  - `default/default/default` fallback pricing rows in `model_pricing`
- `dev:seed-ai` is idempotent by upsert on existing unique keys (provider key, provider+model key, tenant+provider+credential name, tenant+route key, provider+model+route+unit pricing key).
- Workflow reserve pricing now resolves by provider/model/route/unit with fallback order:
  1. `provider + model + route + unit`
  2. `provider + model + default + unit`
  3. `provider + default + default + unit`
  4. `default + default + default + unit`
- If pricing is still missing after fallback, run creation returns `PRICING_NOT_FOUND` and does not enqueue worker execution.
- For local QA, configure tenant-scoped AI gateway records through v2 admin endpoints:
  - `POST /api/v2/admin/ai/providers`
  - `POST /api/v2/admin/ai/models`
  - `POST /api/v2/admin/credentials`
  - `POST /api/v2/admin/ai/routes`
- Keep provider secrets server-side only. Do not put API keys in frontend env variables.
- Ensure route keys used by workflow node config match active tenant routes before starting workflow runs.

Mock provider behavior:

- `image.default`: mock success image output (stored through existing worker asset pipeline)
- `image.fail`: mock failure path for refund/release verification

Local failure-path QA toggle (when UI does not expose route switching yet):

- Temporarily set tenant route `image.default` request config to fail mode:
  - `{"mockMode":"fail","localDevOnly":true}`
- Run one generation from `/projects/:projectId` and verify failure + refund behavior.
- Restore `image.default` back to success mode after verification:
  - `{"mockMode":"success","localDevOnly":true}`
- Keep dedicated `image.fail` route as fail mode for explicit backend-side route testing:
  - `{"mockMode":"fail","localDevOnly":true}`

Validation points:

- A generation request reserves credits before execution
- A successful run settles the reserved amount
- A failed run refunds or releases the reserved amount
- Worker retry does not duplicate charges
- Insufficient balance returns `402 INSUFFICIENT_BALANCE` and does not enqueue free execution
- Provider/model/route pricing match can be audited after each run:
  - check latest `node_runs.cost_json` for:
    - `pricingMatch.provider`
    - `pricingMatch.model`
    - `pricingMatch.route`
    - `pricingMatch.unit`
    - `pricingFallbackLevel`
    - `estimatedCredits`
    - `reservedCredits`
  - check latest reserve `billing_ledger.metadata` for matching `pricingMatch` + `pricingFallbackLevel`
- Local SQL example (`<tenant-id>` must be replaced):

```sql
SELECT
  nr.id,
  nr.node_type,
  nr.cost_json->'pricingMatch' AS pricing_match,
  nr.cost_json->>'pricingFallbackLevel' AS pricing_fallback_level,
  nr.cost_json->>'estimatedCredits' AS estimated_credits,
  nr.cost_json->>'reservedCredits' AS reserved_credits,
  nr.created_at
FROM node_runs nr
JOIN workflow_runs wr ON wr.id = nr.workflow_run_id
WHERE wr.tenant_id = '<tenant-id>'::uuid
  AND nr.node_type = 'image.generate'
ORDER BY nr.created_at DESC
LIMIT 5;
```

```sql
SELECT
  bl.id,
  bl.entry_type,
  bl.amount_cents,
  bl.metadata->'pricingMatch' AS pricing_match,
  bl.metadata->>'pricingFallbackLevel' AS pricing_fallback_level,
  bl.created_at
FROM billing_ledger bl
WHERE bl.tenant_id = '<tenant-id>'::uuid
  AND bl.entry_type = 'reserve'
ORDER BY bl.created_at DESC
LIMIT 5;
```

## 8. Known Non-blocking Issues

- `npm test` still fails in the existing legacy migration asset count / storage upload assertions:
  - `dry-run does not write DB or S3`
  - `missing asset files record a warning without crashing the batch`
  - `asset migration writes object content to storage but not to the DB writer payload, and includes tenant scope`
- `npm run build` still emits the existing Vite chunk size warning
- When no local database environment is configured, some API and DB integration tests may be skipped

## 9. Troubleshooting Map

Use the following module map when a validation step fails.

### Auth

- `src/auth/AuthProvider.tsx`
- `src/auth/useAuth.ts`
- `src/services/v2HttpClient.ts`
- `src/services/v2AuthClient.ts`
- `apps/api/src/modules/auth/auth.routes.ts`
- `apps/api/src/modules/auth/auth.service.ts`

### Workspace / Projects

- `src/workspace/WorkspacePage.tsx`
- `src/workspace/workspaceApi.ts`
- `apps/api/src/modules/projects/projects.routes.ts`
- `apps/api/src/modules/projects/projects.service.ts`

### Remote Drafts

- `src/flowCanvas/FlowProjectPage.tsx`
- `src/flowCanvas/hooks/useRemoteFlowProject.ts`
- `src/flowCanvas/hooks/useRemoteFlowAutosave.ts`
- `src/flowCanvas/services/flowProjectApi.ts`
- `apps/api/src/modules/flows/flows.routes.ts`
- `apps/api/src/modules/flows/flows.service.ts`
- `packages/db/migrations/000010_flow_drafts.sql`

### Assets / MinIO

- `src/assets/assetApi.ts`
- `src/assets/AssetPreviewModal.tsx`
- `apps/api/src/modules/assets/assets.routes.ts`
- `apps/api/src/modules/assets/assets.service.ts`
- `packages/storage/src/s3-storage-provider.ts`

### Billing

- `src/billing/billingApi.ts`
- `apps/api/src/modules/billing/billing.routes.ts`
- `apps/api/src/modules/billing/billing.service.ts`
- `packages/db/src/billing.ts`
- `packages/db/migrations/000012_billing_redeem_payments.sql`

### Workflow reserve / settle / refund

- `src/flowCanvas/runtime/v2WorkflowRunner.ts`
- `src/services/v2WorkflowRunsApi.ts`
- `apps/api/src/modules/workflow-runs/workflow-runs.routes.ts`
- `apps/api/src/modules/workflow-runs/workflow-runs.service.ts`
- `apps/worker/src/workflow-runtime/service.ts`
- `packages/db/src/billing.ts`
