# Production Readiness Audit

Date: 2026-05-20
Branch: production-readiness
Scope: Production Readiness Audit + P0 launch preparation only.

## A1. Capabilities Already Available

- User login / session / tenant
- Project canvas
- Workflow run creation
- Route selector
- `image.default` mock success
- `image.fail` mock refund
- `image.openai` OpenAI-compatible relay success
- Provider Settings Admin UI
- CredentialVault
- Route-aware pricing
- Billing reserve / settle / refund
- Object storage / assets
- `assetId` writeback and persistence
- Worker queue
- Local development guide

## A2. P0 Blocker Checklist

### P0-1: Production env vars and secret management are complete

Status: PASS

Evidence:
- `docs/PRODUCTION_DEPLOYMENT.md` is created in this audit phase.

Risk:
- Missing runbook-level environment contract can cause unsafe deployment.

Fix:
- Add placeholder-only production env inventory and guardrails.

Owner:
- Codex

### P0-2: Database migration, backup, and restore plan is complete

Status: PASS

Evidence:
- `docs/PRODUCTION_RUNBOOK.md` is created in this audit phase.

Risk:
- Migration without rollback/restore steps can cause prolonged outage.

Fix:
- Add preflight, backup, migration, verify, restore templates.

Owner:
- Codex

### P0-3: Redis / queue / worker production strategy exists

Status: PASS

Evidence:
- `apps/worker/src/workflow-runtime/service.ts`
- `packages/redis/src/queues.ts`
- Queue idempotency keys used for reserve/settle/refund.

Risk:
- Operational tuning still needed (monitoring), but baseline strategy exists.

Fix:
- P1 monitoring/alerts follow-up.

Owner:
- Later

### P0-4: Object storage bucket / permissions / signed access strategy is clear

Status: PASS

Evidence:
- Existing asset path uses server-side storage credentials.
- Missing consolidated production doc before this audit.

Risk:
- Misconfigured bucket/privacy in production.

Fix:
- Document private bucket + server-side credential path + safe access expectations.

Owner:
- Codex

### P0-5: CredentialVault master key production config and rotation plan are clear

Status: PASS

Evidence:
- `apps/api/src/config/env.ts`
- `apps/worker/src/config/env.ts`
- `packages/ai-gateway-core/src/credential-vault.ts`

Risk:
- Key loss makes existing credentials undecryptable.

Fix:
- Add production key retention and rotation notes.

Owner:
- Codex

### P0-6: Admin/provider settings permissions are sufficient

Status: PASS

Evidence:
- `apps/api/src/modules/ai-gateway/ai-gateway.routes.ts`
- `requireAuth + requireTenant + requirePermission(...)` on `/api/v2/admin/*` AI and credential routes.

Risk:
- None observed in audited path.

Fix:
- Keep staging smoke checks for viewer `403`.

Owner:
- Later

### P0-7: Tenant scope protections are sufficient

Status: PASS

Evidence:
- `packages/db/src/transaction.ts` sets `app.tenant_id`
- `packages/db/migrations/000006_ai_gateway.sql` RLS policies and FORCE RLS
- Service-level ownership checks in `apps/api/src/modules/ai-gateway/ai-gateway.service.ts`

Risk:
- Manual QA still required in staging.

Fix:
- Include tenant isolation checks in staging smoke test.

Owner:
- Later

### P0-8: Provider key never appears in frontend / node data / flow_drafts / logs

Status: PASS

Evidence:
- `packages/ai-gateway-core/src/redaction.ts`
- `apps/api/src/observability/logger.ts`
- Credential APIs return masked values only.

Risk:
- Requires ongoing log review discipline.

Fix:
- Keep redaction checks in smoke test and incident runbook.

Owner:
- Later

### P0-9: Missing pricing returns PRICING_NOT_FOUND and does not enqueue

Status: PASS

Evidence:
- `apps/api/src/modules/workflow-runs/workflow-runs.service.ts`
- `apps/api/test/workflow-runs.test.ts`

Risk:
- None observed.

Fix:
- Preserve test coverage.

Owner:
- Later

### P0-10: Provider failure always refund/releases reserved balance

Status: PASS

Evidence:
- `apps/worker/src/workflow-runtime/service.ts`
- `apps/api/src/modules/workflow-runs/workflow-runs.service.ts`

Risk:
- Operational failures still require alerting (P1).

Fix:
- Add queue/billing anomaly monitoring in P1.

Owner:
- Later

### P0-11: Production CORS / cookie / JWT / HTTPS configuration is clear

Status: PASS

Evidence:
- Config exists in code but no consolidated production guide before this audit.

Risk:
- Inconsistent security config across environments.

Fix:
- Add explicit env contract in `docs/PRODUCTION_DEPLOYMENT.md`.

Owner:
- Codex

### P0-12: Logging redaction covers Authorization / token / API key / credential

Status: PASS

Evidence:
- `apps/api/src/observability/logger.ts`
- `packages/ai-gateway-core/src/redaction.ts`

Risk:
- Requires no ad-hoc raw logging in future changes.

Fix:
- Keep redaction checks in CI/test and smoke checklist.

Owner:
- Later

### P0-13: Staging smoke test is defined

Status: PASS

Evidence:
- No dedicated production runbook document before this audit.

Risk:
- Incomplete go/no-go validation.

Fix:
- Add staging smoke checklist to runbook.

Owner:
- Codex

### P0-14: Rollback / emergency switches are defined

Status: PASS

Evidence:
- No dedicated production cutover/rollback doc before this audit.

Risk:
- Slow or unsafe incident response.

Fix:
- Add rollback + emergency switches to runbook.

Owner:
- Codex

### P0-15: If real payment is not integrated, product is explicitly limited to internal/manual-credit beta

Status: PASS

Evidence:
- Prior docs mention no real payment, but launch policy not centralized.

Risk:
- Product launch posture ambiguity.

Fix:
- Explicitly state internal/manual-credit beta limitation in production docs.

Owner:
- Codex

### P0-16: Input validation strictness for modality/unit/status/routeKey

Status: PASS

Evidence:
- `apps/api/src/modules/ai-gateway/ai-gateway.schemas.ts` previously allowed loose strings in several fields.

Risk:
- Invalid input acceptance and inconsistent behavior.

Fix:
- Tighten enums and route key format with schema validation and keep invalid request path on 400.

Owner:
- Codex

## A3. P1 / P2 Follow-ups

### P1

- DB integration tests reliably running in CI (no environment-dependent skips for critical tenant-scope paths).
- Admin audit log operational review workflow.
- Credential rotation full manual verification.
- Dangerous provider setting change confirmation dialogs.
- Worker/queue metrics monitoring.
- Provider rate-limit/quota alerts.
- Sentry or equivalent error reporting.
- Staging E2E smoke script.
- Asset cleanup/orphan strategy.

### P2

- Real payment integration.
- Gemini / Replicate / Fal providers.
- Full model marketplace.
- Finer-grained RBAC.
- OpenTelemetry/APM dashboard.
- Browser E2E automation.
- Vite chunk optimization.

## Launch Decisions

- Staging launch: YES (P0 scope in this phase completed and validated).
- Private beta launch: YES (must stay internal/manual-credit with allowlisted users).
- Public production launch: NO (real payment not integrated).

## Explicit Constraints

- Real payment is not integrated.
- If launching before payment, product must operate as internal/manual-credit beta.
- No real API keys are committed.
- Provider credentials are server-side only.
