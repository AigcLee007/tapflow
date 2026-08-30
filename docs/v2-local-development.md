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

## 6.1 Agent + Skill V2 Local Flags

Agent V2 and Skills are opt-in. Keep every flag disabled for the default local
path, then enable the matching server and Vite flags in the same shell/build
when testing the new panel:

```env
AGENT_V2_ENABLED=false
AGENT_V2_RUNTIME_ENABLED=false
AGENT_V3_ENABLED=false
AGENT_V3_RUNTIME_ENABLED=false
AGENT_V3_MAX_TOOL_ROUNDS=8
AGENT_V3_MAX_CONTEXT_NODES=60
AGENT_V3_MAX_VISUAL_CAPTURES=4
AGENT_V3_REPAIR_ATTEMPTS=1
AGENT_SKILLS_ENABLED=false
AGENT_SKILL_AUTHORING_ENABLED=false
AGENT_SKILL_RUNTIME_ENABLED=false
AGENT_SKILL_MAX_SOURCE_CHARS=24000
AGENT_SKILL_MAX_STEPS=12
AGENT_SKILL_REPAIR_ATTEMPTS=1
VITE_AGENT_V2_ENABLED=false
VITE_AGENT_V3_ENABLED=false
VITE_AGENT_SKILLS_ENABLED=false
VITE_AGENT_SKILL_AUTHORING_ENABLED=false
VITE_AGENT_SKILL_RUNTIME_ENABLED=false
```

Enablement is conjunctive: the V2 panel requires both `AGENT_V2_ENABLED` and
`VITE_AGENT_V2_ENABLED`; Skill browsing requires both
`AGENT_SKILLS_ENABLED` and `VITE_AGENT_SKILLS_ENABLED`; authoring and runtime
each require their corresponding pair. If a server capability is
unavailable or a runtime flag is off, the UI must remain on the current Agent
panel and V2 write requests must be rejected. Never infer enablement from
`import.meta.env.DEV`.

Agent V3 is also conjunctive: both `AGENT_V3_ENABLED` and
`AGENT_V3_RUNTIME_ENABLED` must be true before the server reports the
product-safe `v3_real` runtime identity. Keep it disabled by default. Staging
and production must not silently fall back to another runtime when V3 is
enabled but unavailable; inspect the capability response and fail closed.

After changing a `VITE_*` value, restart Vite. API/Worker values are read at
process start, so restart both processes as well. Use the server capability
endpoint to confirm the effective rollout without exposing provider details:

```bash
curl -s http://localhost:3366/api/v2/agent/capabilities
```

## 6.2 Agent + Skill Smoke And Replay

Run migrations before enabling the runtime. The Agent metadata and Skill tables
are applied by the normal migration command (`000075` and `000076` in the
current tree):

```bash
npm run db:migrate
```

Seed the provider-agnostic official catalog only in local development. This
command is intentionally blocked outside `NODE_ENV=development` unless an
operator explicitly sets `DEV_SEED_ENABLED=true`; it only manages
platform-scoped official Skills and never modifies private tenant Skills:

```bash
npm run dev:seed-agent-skills
```

With authenticated test credentials, verify in order: create a session, send a
text-only turn, browse and select a published Skill, run a text Skill, then an
image/video Skill through the normal workflow path. Approvals must be required
before paid execution; cancellation must prevent later canvas mutations. Replay
the Skill run events with `afterSeq` and confirm sequence numbers are strictly
monotonic:

```bash
curl -s -H "Authorization: Bearer $TAPFLOW_ACCESS_TOKEN" \
  "http://localhost:3366/api/v2/agent/skill-runs/<run-id>/events?afterSeq=0"
```

Verify generated media appears in `/assets` and the refreshed canvas stores
only tenant-owned `assetId` references (never base64, `blob:`/`data:` URLs,
signed URLs, `File`, or `Blob` values). Exercise a stale draft revision and
confirm the API returns `409` rather than silently overwriting another tab.

For local observability, retain `requestId`, `agentVersion`, `turnId`,
`skillId`, `skillVersionId`, `skillRunId`, `skillStepId`, `graphRevision`,
`durationMs`, `firstEventLatencyMs`, `failedStep`, `retryCount`, and
`redactionHits` in structured API/Worker logs. Provider keys, authorization
headers, upstream route configuration, and raw prompts containing secrets must
not be logged or returned to the browser.

Provider settings UI (local/dev):

- Route: `/account/provider-settings`
- This UI is intended for local/dev maintenance of AI route/provider settings.
- The page requires authenticated user + tenant context.
- The API still enforces admin permissions (`provider:read` / `provider:manage` / `credential:manage`);
  ordinary viewer/basic users are blocked with `403`.
- This page supports editing:
  - `baseUrlOverride`
  - model binding (`modelId`)
  - `requestConfig.timeoutMs`
  - route `status`
  - route pricing (`min_charge_credits` for `image_generation`)
- Credential updates are write-only; existing secret is never returned.
- Never screenshot or commit real API keys.
- Pricing changes here affect subsequent workflow run billing.

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
- Optional OpenAI-compatible image seed (requires a real key in local env, still server-side encrypted):

  ```powershell
  $env:NODE_ENV="development"
  $env:OPENAI_COMPAT_BASE_URL="https://sub.siphonlab.cn/v1"
  $env:OPENAI_API_KEY="sk-..."
  npm run dev:seed-ai -- --email your-user@example.com
  ```

  Or pass key/baseUrl/model explicitly:

  ```powershell
  $env:NODE_ENV="development"
  npm run dev:seed-ai -- --email your-user@example.com --openai-api-key sk-... --openai-base-url https://sub.siphonlab.cn/v1 --openai-image-model gpt-image-2
  ```

  This additionally seeds:
  - provider key: `openai-compatible` (kind: `openai-compatible`)
  - model key: configurable via `--openai-image-model` (default `gpt-image-1`)
  - route key: `image.openai`
  - route-aware pricing row: `openai-compatible/<model>/image.openai/image_generation`
  - route `request_config.timeoutMs`: `120000` (image generation default for relay calls)

  The key is stored only via server-side `CredentialVault` encryption. It is not returned to frontend route APIs, node data, or draft graph JSON.
  Never commit or screenshot real API keys.
  If your relay does not expose `/v1` by default, set base URL accordingly. If you see `404`, re-check whether the relay requires `/v1`.
  If you see `401/403`, verify relay key and account permissions.
  If model is rejected, pass a relay-supported model name with `--openai-image-model`.
  OpenAI-compatible image generation can exceed 10s on some relays/models. Timeout resolution for image route calls is:
  1. route `request_config.timeoutMs`
  2. provider `capabilities.timeoutMs`
  3. `OPENAI_COMPAT_IMAGE_TIMEOUT_MS` or `OPENAI_IMAGE_TIMEOUT_MS`
  4. fallback `120000`
  If timeout persists, verify relay model availability and real generation latency first.
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

Local route selection QA:

- Image generation node UI now supports route selection via `/api/v2/ai/routes?modality=image`.
- Use `image.default` for success path verification.
- Use `image.fail` for failure/refund verification.
- `image.default` and `image.fail` are separate selectable route options in the node route selector even when they share the same provider/model.
- Preferred QA path is direct UI route selection; no DB-side route mutation is required for normal fail-path validation.
- For OpenAI-compatible relay config changes, use `/account/provider-settings` to update:
  - `image.openai` base URL override
  - image model binding
  - route `timeoutMs`
  - route status
  - image generation `min_charge_credits` pricing
  - credential rotation (write-only key input)
- If you temporarily override `image.default` to fail mode for backend-only diagnostics, always restore it:
  - fail: `{"mockMode":"fail","localDevOnly":true}`
  - success: `{"mockMode":"success","localDevOnly":true}`

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

## Production Pre-Launch Notes (2026-05-20)

This local dev guide does not authorize production launch by itself.

Before staging or production rollout, follow:

- `docs/PRODUCTION_READINESS.md`
- `docs/PRODUCTION_DEPLOYMENT.md`
- `docs/PRODUCTION_RUNBOOK.md`

Mandatory launch posture:

- Real payment is not integrated.
- If launching before payment, product must operate as internal/manual-credit beta.
- No public paid production launch until payment integration is complete.

Secret and credential policy:

- No real API keys may be committed to repository files.
- Provider credentials are server-side only (CredentialVault).
- Frontend responses must not contain raw secret or credential encryption material.
