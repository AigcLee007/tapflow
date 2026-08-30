# Production Runbook

## Personal Wallet And XunhuPay

The personal-wallet migration is a forward-only billing cutover. Before deployment, back up PostgreSQL, set `PAYMENTS_ENABLED=false`, stop `tapflow-worker`, run compiled database migrations, and execute the compiled wallet migration CLI in dry-run mode. Only run the confirmed write mode after totals match and no active reservations or missing workspace owners remain.

Use `docker-compose.staging.yml` and the server environment file. Merchant values must remain server-side. After personal reserve/settle/refund smoke tests in two workspaces, perform and record the CNY 9.90 purchase, duplicate callback, reconciliation, expiry snapshot, and completely unused-order refund before enabling checkout. If checkout fails after cutover, disable `PAYMENTS_ENABLED` and apply a forward repair; do not return live charging to tenant balances.

Keep `DATABASE_URL` on the Supabase Transaction Pooler at port 6543 for API/Worker runtime. Set `MIGRATION_DATABASE_URL` to a Supabase Direct connection or Session Pooler at port 5432; Compose injects it only into the one-shot `tapflow-migrator`. Store both only in `/opt/aittco/env/tapflow.staging.env`. Never print either URL or place it directly in a shell command. Keep the Worker stopped until schema migration, legacy reservation reconciliation, wallet dry run, and confirmed wallet write are complete.

Set `API_DATABASE_ROLE` to the PostgreSQL role used by `DATABASE_URL`. The migrator uses this non-secret role name for the wallet runtime ACL follow-up migration; the API and Worker do not receive `MIGRATION_DATABASE_URL`.

Staging evidence currently shows that migration `000044` terminated through the Transaction Pooler on port 6543, the Session Pooler on port 5432, and its original Supabase SQL Editor bundle. The Direct hostname resolved IPv6-only from the deployment server and failed with `ENETUNREACH` because that server has no IPv6 route. Migrations `000044` and `000045` therefore remain pending; do not report wallet migration acceptance from the recorded `000042`/`000043` rows.

If the Direct route remains unreachable and both poolers terminate the revised managed-role DDL, use the SQL Editor only after the compatibility source is committed, pushed, and deployed. Generate separate bundles from the exact deployed `000044` and `000045` sources and checksums. Apply and verify `000044` as one transaction before applying `000045` as a separate transaction; confirm each exact filename/checksum in `schema_migrations`, and never reuse the terminated original bundle. Keep the wallet write step blocked until the known 301.2 legacy reserved credits are reconciled and the dry run reports matched totals with zero active reservations.

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/cli.js
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/personal-wallet-migration-cli.js --dry-run
```

Run legacy reservation reconciliation before the wallet write. Its dry run must show only terminal `failed`/`canceled` reservations and positive orphan grant counters:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/personal-wallet-reconciliation-cli.js --dry-run
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/personal-wallet-reconciliation-cli.js --write --confirm LEGACY_RESERVATION_RECONCILIATION
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/personal-wallet-migration-cli.js --dry-run
```

If the dry run reports non-terminal reservations and the cutover decision is to cancel them, use the explicit force-cancel confirmation:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/personal-wallet-reconciliation-cli.js --write --confirm LEGACY_RESERVATION_RECONCILIATION --cancel-non-terminal
```

Only after the dry-run acceptance gate passes:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/personal-wallet-migration-cli.js --write --confirm PERSONAL_WALLET_CUTOVER
```

Date: 2026-05-20
Branch: production-readiness

## D1. Migration Preflight

1. Confirm release commit hash.
2. Stop or pause worker.
3. Backup Postgres.
4. Run migrations.
5. Verify migration success.
6. Start API.
7. Start worker.
8. Run smoke tests.

## D1.1 Agent + Skill V2 Rollout

Agent V2 and Skill runtime are deployed dark. Keep all server and frontend V2
flags `false` while shipping the backward-compatible API, frontend bundle,
Worker image, and migrations. Production migrations run from the compiled
image, and the Worker stays stopped during the migration:

```bash
cd /opt/aittco/tapflow
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml build
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml stop tapflow-worker
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-api node packages/db/dist/cli.js
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend
```

Enable in stages, recording the change and smoke result at each gate:

1. Enable V2 server and matching Vite panel flags for an internal tenant (or
   an isolated internal environment); leave Skill authoring/runtime disabled.
2. Enable `AGENT_SKILLS_ENABLED` plus its matching Vite flag and verify catalog
   browse/select and immutable Skill version binding.
3. Enable authoring for the internal cohort, then enable Skill runtime for one
   canary tenant only after approval, billing, text, image, and video smoke
   tests pass.
4. Complete staging acceptance, then expand the canary in controlled batches.

The V2 panel requires both server and Vite flags. Every turn records
`agent_version`; legacy sessions are not force-migrated. A lease prevents a
legacy and V2 runtime from executing the same turn concurrently. When V2 is
disabled, the UI falls back to the existing Agent panel and existing sessions
remain readable.

### Observability And Acceptance

Dashboards and structured logs must retain `requestId`, `agentVersion`,
`turnId`, `skillId`, immutable `skillVersionId`, `skillRunId`, `skillStepId`,
`durationMs`, `firstEventLatencyMs`, `failedStep`, `retryCount`,
`redactionHits`, and final delivery status (`reviewing`/`succeeded`/`failed`).
Alert on repeated failed steps, lease conflicts, replay sequence gaps,
unexpected `409` rates, provider timeout/429 spikes, and non-zero reserved
credits after failed runs. Creator-facing logs must not contain provider
credentials, authorization headers, upstream route configuration, or raw
secret-bearing prompt/context fields.

Before expanding beyond the canary, verify: text Skill output is written to a
text node; image/video outputs create tenant assets and survive refresh;
approval is required before paid execution; cancellation stops later steps;
`afterSeq` replay is monotonic; incomplete delivery enters `reviewing`; billing
reserve/settle/refund is idempotent; and no secret material appears in API
responses, drafts, events, or logs.

### Rollback

Rollback is flag-first and preserves data:

1. Set `AGENT_V2_RUNTIME_ENABLED=false` and its Vite runtime flag; restart API,
   Worker, and frontend as applicable.
2. Set `AGENT_SKILL_RUNTIME_ENABLED=false`, then disable authoring and Skill
   catalog flags if required. Existing legacy/V2 history remains readable.
3. Stop the Worker before any schema rollback is explicitly approved. Prefer
   redeploying the previous API/frontend/Worker image; do not delete Skill,
   Skill-version, Skill-run, generated Asset, flow-draft, or immutable billing
   ledger rows.
4. Re-enable only after a forward fix and a fresh migration/smoke pass. If a
   provider route is unsafe, set that route `inactive` rather than deleting it.

## D1.2 GPT-Image-2 Route Import

Use this only after deploying the release containing `scripts/import-gpt-image-2-routes.mjs`. The two API keys stay in `/opt/aittco/env/tapflow.staging.env`; the normal API and Worker services do not receive them as environment variables.

```bash
cd /opt/aittco/tapflow

set -a
. /opt/aittco/env/tapflow.staging.env
set +a

docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm \
  -e MOUXIHUB_GPT_IMAGE_2_API_KEY \
  -e PIXELLELABS_GPT_IMAGE_2_API_KEY \
  tapflow-api node scripts/import-gpt-image-2-routes.mjs

docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm \
  -e MOUXIHUB_GPT_IMAGE_2_API_KEY \
  -e PIXELLELABS_GPT_IMAGE_2_API_KEY \
  tapflow-api node scripts/import-gpt-image-2-routes.mjs --apply

unset MOUXIHUB_GPT_IMAGE_2_API_KEY PIXELLELABS_GPT_IMAGE_2_API_KEY
```

The import is transactional and produces two inactive routes. Canvas route menus intentionally hide inactive routes, so test both imported lines on the server before publication. The importer allows up to five minutes per line because these image providers can exceed the 30-second general admin-test budget:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm \
  -e TAPFLOW_IMPORT_TENANT_ID \
  -e TAPFLOW_IMPORT_USER_ID \
  tapflow-api node scripts/import-gpt-image-2-routes.mjs --test
```

Then publish both lines with the intended default line:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm \
  tapflow-api node scripts/import-gpt-image-2-routes.mjs --publish image.gpt-image-2.mouxihub-official
```

Replace the final route key with `image.gpt-image-2.pixellelabs-stable` to use that line as the default. Publication refuses to proceed unless both routes have a successful test for their current configuration revision. Never run the commands with shell tracing enabled.

## D2. Backup Command Templates

```bash
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M%S).sql
```

Windows/Docker dev example:

```bat
docker exec infra-postgres-1 pg_dump -U aigc_flow aigc_flow > backup.sql
```

## D3. Restore Template

```bash
psql "$DATABASE_URL" < backup.sql
```

Warning:

- Production DB restore is high risk.
- Restore only during approved maintenance window.

## D4. Legacy Migration 3 Known Failures

- Current `npm test` still has 3 known legacy migration failures.
- They are documented as legacy/local migration path issues.
- Do not fix in this phase unless proven production blocker for current v2 AI/assets/billing path.

## E1. Worker/Queue/Billing Readiness

Checks:

- Worker can scale horizontally.
- Queue prefix is environment-specific.
- Billing relies on idempotency keys to avoid double charge.
- Provider timeout/retry behavior is bounded.
- Queue health endpoint is available for admin diagnostics.

Idempotency keys:

- `reserve:<tenantId>:<workflowRunId>:<nodeRunId>`
- `settle:<tenantId>:<workflowRunId>:<nodeRunId>`
- `refund:<tenantId>:<workflowRunId>:<nodeRunId>`

## E2. Billing Invariants

- Missing pricing => `PRICING_NOT_FOUND` and no enqueue/no free execution.
- Provider failure => refund/release and reserved returns toward 0.
- Success path only => settle + usage event.
- Pricing changes affect future runs only, not historical immutable ledger facts.

## E3. QA Checklist

- [ ] image.default mock success
- [ ] image.fail mock refund
- [ ] image.openai relay success
- [ ] image.openai invalid key refund
- [ ] provider timeout refund
- [ ] pricing missing PRICING_NOT_FOUND
- [ ] pricing update affects next billing
- [ ] admin 403 for viewer
- [ ] credential masked display
- [ ] assets persist after refresh
- [ ] workspace result persists after refresh

## G1. Staging Environment Requirements

- staging DB
- staging Redis
- staging object storage bucket
- staging CredentialVault master key
- staging JWT secrets
- staging domain + HTTPS
- staging relay key
- staging admin user
- staging QUEUE_PREFIX

## G2. Staging Smoke Test

- [ ] login
- [ ] admin can open `/account/provider-settings`
- [ ] viewer gets 403
- [ ] `image.openai` visible in route selector
- [ ] `image.openai` generate success
- [ ] assets appear
- [ ] workspace result persists after refresh
- [ ] billing reserve/settle
- [ ] invalid key refund
- [ ] provider timeout refund
- [ ] logs contain no secret
- [ ] restart worker and run again
- [ ] update pricing and verify next run uses new price

Only allow production cutover after staging smoke passes.

## H1. Production Preflight

- [ ] confirm git commit
- [ ] confirm build artifact
- [ ] confirm env vars
- [ ] confirm DB backup
- [ ] confirm Redis namespace
- [ ] confirm S3 bucket
- [ ] confirm admin user
- [ ] confirm provider credential exists
- [ ] confirm `image.openai` route exists
- [ ] confirm pricing exists
- [ ] confirm provider settings page access

## H2. Deploy

1. Stop worker.
2. Backup DB.
3. Run DB migrations.
4. Deploy API.
5. Deploy frontend.
6. Start worker.
7. Run health checks.
8. Run smoke tests.

## H3. Post-Deploy Smoke

- [ ] login
- [ ] open provider settings
- [ ] `image.openai` generate
- [ ] assets appear
- [ ] billing reserve/settle
- [ ] invalid key refund
- [ ] logs contain no secret

## H4. Rollback

1. Stop worker.
2. Disable `image.openai` route if provider is broken.
3. Roll back API/frontend version.
4. Restore DB only when required and after approval.
5. Keep ledger immutable if possible.
6. Verify no stuck reserved balance.

## H5. Emergency Switches

- Set route status `inactive`.
- Stop worker.
- Set worker concurrency to `0`.
- Rotate provider credential.
- Disable provider settings admin route.
- Revoke admin user permission.

## Launch Decision Gates

- Staging launch allowed only after P0 checks + required build/tests pass.
- Private beta allowed only after staging pass and must remain internal/manual-credit.
- Public production launch blocked while real payment is not integrated.
- Current decision in this phase: Staging YES, Private beta YES, Public production NO.

## Explicit Statements

- Real payment is not integrated.
- If launching before payment, product must operate as internal/manual-credit beta.
- No real API keys are committed.
- Provider credentials are server-side only.

## Backfill Asset Variants

The historical repair is audit-first. It never reads original objects or writes variants directly: explicit apply mode only enqueues the existing `asset.image-variant` Worker job. Keep `WORKER_IMAGE_VARIANTS_MODE=sync` and `ASSET_IMAGE_VARIANT_CONCURRENCY=2` for the first rollout.

First audit the missing `thumb`/`preview` coverage without connecting to Redis or changing data:

```bash
cd /opt/aittco/tapflow
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-worker npm run assets:backfill-variants -- --limit=500 --batch-size=25 --missing=any
```

List active tenants in the approved read-only database session, then enqueue a first small, scoped batch:

```sql
SELECT id::text, name, slug
FROM tenants
WHERE status = 'active'
ORDER BY name, id;
```

```bash
read -r -p "Approved tenant UUID: " TAPFLOW_VARIANT_TENANT_ID
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-worker npm run assets:backfill-variants -- --apply --tenant-id="${TAPFLOW_VARIANT_TENANT_ID}" --limit=20 --batch-size=5 --missing=any
```

In production, an unscoped `--apply` is refused unless `ASSET_VARIANT_BACKFILL_PRODUCTION_ACK=enqueue-all-tenants` is supplied explicitly. Do not use it until the scoped batch has succeeded.

Use this read-only query to measure completed coverage after each controlled batch:

```sql
SELECT
  count(*) AS supported_assets,
  count(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM asset_variants v
      WHERE v.tenant_id = a.tenant_id AND v.asset_id = a.id AND v.variant_key = 'thumb'
    )
    AND EXISTS (
      SELECT 1 FROM asset_variants v
      WHERE v.tenant_id = a.tenant_id AND v.asset_id = a.id AND v.variant_key = 'preview'
    )
  ) AS fully_covered_assets,
  round(100.0 * count(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM asset_variants v
      WHERE v.tenant_id = a.tenant_id AND v.asset_id = a.id AND v.variant_key = 'thumb'
    )
    AND EXISTS (
      SELECT 1 FROM asset_variants v
      WHERE v.tenant_id = a.tenant_id AND v.asset_id = a.id AND v.variant_key = 'preview'
    )
  ) / NULLIF(count(*), 0), 2) AS coverage_percent
FROM assets a
WHERE a.kind = 'image'
  AND a.status = 'available'
  AND a.deleted_at IS NULL;
```

Acceptance gates: variant coverage above 99%; signing P95 below 100ms excluding public RTT; first canvas thumb P75 below 1s/P95 below 2s; 90% of 12 visible thumbs P75 below 1.5s/P95 below 3s; same-tab refresh first image below 500ms; thumb P95 below 300KB; twelve thumbs below 2.5MB; and no original image requests after repair.

Roll out in this order: capture baseline, deploy backward-compatible API, deploy Worker/script, audit, enqueue 20 scoped assets, inspect queue failures/CPU/storage/`asset_variants`, complete controlled batches, deploy frontend, then run mainland-China browser checks. To roll back, stop further enqueueing, roll the frontend back to preview-first behavior first, reduce image-variant concurrency or stop the Worker before changing queue behavior, and roll API back last. Never delete generated variants, originals, drafts, workflow history, or billing records.
# Canvas Agent V3 rollback

If V3 behavior is unsafe or incomplete, stop `tapflow-worker`, set `AGENT_V3_ENABLED=false`, `AGENT_V3_RUNTIME_ENABLED=false`, and `VITE_AGENT_V3_ENABLED=false` in the Compose environment, then redeploy the v2 stack. Do not delete V3 tasks, events, operation records, Skills, assets, flow drafts, or billing ledger entries.
