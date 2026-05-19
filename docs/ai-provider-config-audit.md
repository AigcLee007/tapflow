# AI Provider / Model / Route / Credential Audit

Date: 2026-05-19  
Branch: `ai-provider-config-audit`

This audit follows:

- `AGENTS.md`
- `docs/DEVELOPMENT_PLAN.md`
- `docs/CODEX_HANDOFF.md`
- `docs/v2-local-development.md`
- `docs/legacy-cleanup-audit.md`

Scope for this phase: audit + documentation only. No real payment wiring, no large business logic changes, no new feature implementation.

## 1. Current State

Current v2 chain already exists in code for workflow-run + billing + worker + assets:

1. Frontend (`src/flowCanvas/runtime/v2WorkflowRunner.ts`) calls `src/services/v2WorkflowRunsApi.ts`.
2. API (`apps/api/src/modules/workflow-runs/workflow-runs.service.ts`) creates `workflow_runs` / `node_runs`, reserves billing for billable nodes, and enqueues worker jobs.
3. Worker (`apps/worker/src/workflow-runtime/service.ts`) executes node runtime, records usage, settles on success, refunds open reservations on failure.
4. Generated media is persisted to storage + `assets` via `apps/worker/src/workflow-runtime/media-asset-store.ts`, then linked back to node output as `assetId`.

Provider/model/route/credential management API already exists under admin v2 endpoints:

- `/api/v2/admin/ai/providers`
- `/api/v2/admin/ai/models`
- `/api/v2/admin/ai/routes`
- `/api/v2/admin/credentials`

## 2. Existing Database Tables / Migrations

### AI Gateway and credentials

From `packages/db/migrations/000006_ai_gateway.sql`:

- `ai_providers`
- `ai_models`
- `api_credentials`
- `ai_routes`
- `ai_call_logs`

Notes:

- `api_credentials` stores encrypted material in `encrypted_secret`, `nonce`, `auth_tag`, `key_version`.
- `api_credentials` and `ai_routes` include tenant-aware RLS policies.

### Workflow run lifecycle

From `packages/db/migrations/000007_workflow_runs.sql`:

- `workflow_runs`
- `node_runs`
- `workflow_run_events`

### Billing and pricing

From `packages/db/migrations/000008_billing.sql` and `000012_billing_redeem_payments.sql`:

- `usage_events`
- `billing_ledger`
- `model_pricing`

### Assets

From `packages/db/migrations/000005_assets.sql`:

- `assets`

Worker writes generated outputs to `assets`, with references to `workflow_run_id` and `node_run_id`.

## 3. Existing API / Worker Flow

### Frontend run request

`src/services/v2WorkflowRunsApi.ts` -> `createWorkflowRun(flowId, { idempotencyKey, input })`:

- POST `/api/v2/flows/:flowId/runs`
- Current request body is minimal (`idempotencyKey`, `input`).
- Provider/model/route are not passed at top-level request body; runtime derives route/model intent mainly from compiled node config in worker (`routeKey`, `model` fields where available).

### API reserve behavior

In `apps/api/src/modules/workflow-runs/workflow-runs.service.ts`:

- Creates run + per-node records.
- Estimates reserve by node type (`image.generate`, `text.generate`, `video.generate`).
- Calls `BillingService.reserveUsageWithClient(...)` with idempotency key:
  - `reserve:${tenantId}:${workflowRunId}:${nodeRunId}`

Current pricing lookup uses:

- `model_pricing` where `provider='default' AND model='default' AND route='default'`

This means reserve is currently not dynamically keyed to selected provider/model/route.

### Worker execution and credential usage

In `apps/worker/src/workflow-runtime/service.ts`:

- Builds text/image/video requests, including `routeKey` and optional `model` from node config.
- Calls DB-backed provider runtimes (`DatabaseTextGenerationRuntime`, `DatabaseMediaRuntime`) that resolve route + provider + credential from DB.
- Credentials are decrypted server-side only through `CredentialVault`; no frontend secret exposure.

### Success settle + assets write

On successful node completion:

1. Worker persists generated media through `MediaAssetStore` to object storage + `assets` table.
2. Worker records usage event (`recordUsageEventWithClient`).
3. Worker settles reservation (`settleUsageWithClient`) with idempotency key:
   - `settle:${tenantId}:${workflowRunId}:${nodeRunId}`
4. Node output references generated assets (`assetId`-based payload).

### Failure refund

On node or workflow failure:

- Worker/API refund open reservations via `refundUsageWithClient`.
- Refund idempotency key pattern:
  - `refund:${tenantId}:${workflowRunId}:${nodeRunId}`

## 4. Gaps

Current blockers for real local AI generation QA are mostly config/data readiness rather than missing billing skeleton:

1. No dedicated local dev seed script for provider/model/route/credential (only `dev:seed-billing` exists).
2. No standardized QA bootstrap doc for creating tenant-scoped provider/model/route/credential records.
3. Reserve pricing in workflow-run API still uses hardcoded `default/default/default` pricing selector, not selected runtime route/model.
4. Frontend does not yet expose a clear productized model/route selection flow for v2 users (node config may carry routeKey/model, but setup path is not polished for QA handoff).
5. Need explicit mapping guidance between node config (`routeKey`, `model`) and active tenant route records.
6. Need explicit local provider API key setup runbook (values location, rotation steps, minimal validation).

## 5. Recommended Next Step

Minimal next implementation plan (separate from this audit):

1. Add a dev seed utility for AI gateway baseline data (provider/model/route/credential) scoped to a tenant.
2. Keep secrets in server-side credential vault only; never expose raw API keys in frontend.
3. Add local docs for one canonical test route key (for example `image.default`) and one minimal provider adapter path.
4. Align reserve pricing lookup with actual selected route/model/provider (or document temporary default-pricing policy explicitly until upgraded).
5. Run end-to-end local QA for reserve -> execute -> settle/refund -> assets -> billing visibility.

## 6. Manual QA Plan

Recommended validation sequence for the next phase:

1. Seed billing balance.
2. Seed provider/model/route/credential for target tenant.
3. Open project canvas.
4. Trigger a generation-capable node.
5. Start workflow run.
6. Verify reserve ledger appears before completion.
7. Wait for worker success path.
8. Verify settle ledger + usage event.
9. Verify generated media appears in `/assets`.
10. Verify node output references generated `assetId`.
11. Simulate provider failure and verify refund/release behavior.

## 7. Risks

1. API keys must never be exposed to frontend state, logs, or response payloads.
2. Credentials must remain encrypted at rest (`encrypted_secret` + `nonce` + `auth_tag`) and decrypted only server-side.
3. Worker retries and polling callbacks must remain idempotent to avoid duplicate charges.
4. Provider async task polling/callback handling must preserve idempotent settle/refund semantics.
5. Generated outputs must be persisted as first-party assets; third-party temporary URLs cannot be the long-term source of truth.

## 8. Local QA Data / Seed Status

Current seed status:

- Available: `npm run dev:seed-billing` for local billing QA.
- Missing: first-class dev seed command for provider/model/route/credential bootstrap.

Recommended seed additions (plan only, not implemented in this phase):

1. Dev seed provider row (active).
2. Dev seed model row (active, mapped to provider).
3. Dev seed credential row (tenant-scoped, encrypted).
4. Dev seed route row (tenant-scoped `route_key`, bound to provider/model/credential).
5. Optional matching pricing rows for clearer reserve estimation by route/model/provider.

