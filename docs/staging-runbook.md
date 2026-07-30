# Staging Runbook

## Start Staging Services

```bash
docker compose -f docker-compose.staging.yml up -d --build tapflow-redis tapflow-api tapflow-worker tapflow-frontend
```

The compose file runs Redis inside the Docker network. Do not publish Redis to the public internet.

## Personal Wallet Cutover

Start with `PAYMENTS_ENABLED=false`. Back up PostgreSQL, build the new images, and stop the worker before schema and wallet migration:

`DATABASE_URL` remains the API/Worker runtime connection through the Supabase Transaction Pooler on port 6543. `MIGRATION_DATABASE_URL` must use a Supabase Direct connection or Session Pooler on port 5432 and is available only to `tapflow-migrator`. Keep both values in `/opt/aittco/env/tapflow.staging.env`; never print either URL or place it directly in a shell command. Keep the Worker stopped until schema migration, legacy reservation reconciliation, the wallet dry run, and the confirmed wallet write all complete.

Current staging limitation: the Transaction Pooler on port 6543, Session Pooler on port 5432, and the original migration-`000044` Supabase SQL Editor bundle all terminated during that migration. The Direct database hostname is IPv6-only from this server, which has no IPv6 route and returned `ENETUNREACH`. Migrations `000044` and `000045` remain unapplied until their revised transactions are verified.

If the server still cannot reach Direct and the managed poolers terminate the revised migration, use the Supabase SQL Editor fallback only after the compatibility commit is pushed and deployed:

1. Generate the `000044` bundle from the exact deployed migration file and checksum; do not reuse the original terminated bundle.
2. Apply `000044` alone as one transaction, then verify its exact filename and checksum in `schema_migrations`.
3. Generate and apply checksum-matched `000045` separately, then verify its `schema_migrations` row.
4. Keep `tapflow-worker` stopped and `PAYMENTS_ENABLED=false` throughout. Do not run the wallet write while the known 301.2 legacy reserved credits remain unreconciled.

```bash
cd /opt/aittco/tapflow
git fetch --all --prune
git pull --ff-only origin main
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml build
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml stop tapflow-worker
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/cli.js
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/personal-wallet-reconciliation-cli.js --dry-run
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/personal-wallet-migration-cli.js --dry-run
```

Only when the reconciliation output contains no non-terminal reservations, execute its approved write and rerun the wallet dry run:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/personal-wallet-reconciliation-cli.js --write --confirm LEGACY_RESERVATION_RECONCILIATION
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/personal-wallet-migration-cli.js --dry-run
```

For an approved cutover that cancels the reported non-terminal reservations, append the explicit force-cancel flag:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/personal-wallet-reconciliation-cli.js --write --confirm LEGACY_RESERVATION_RECONCILIATION --cancel-non-terminal
```

Only when the wallet dry run reports no owner/reservation exceptions and matched totals, execute the approved write migration:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/personal-wallet-migration-cli.js --write --confirm PERSONAL_WALLET_CUTOVER
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend
```

Verify personal reserve/settle/refund from two workspaces before enabling payments. Enable checkout only after a CNY 9.90 real-payment and full-unused-order refund acceptance. After users begin personal-wallet charging, rollback by disabling checkout and applying a forward fix; do not revert to tenant charging.

Default staging Redis URL:

```env
REDIS_URL=redis://tapflow-redis:6379
```

External Redis is still supported by overriding `REDIS_URL`.

## Required Queue Concurrency

Use these defaults unless intentionally load testing:

```env
WORKER_CONCURRENCY=16
NODE_EXECUTE_CONCURRENCY=16
PROVIDER_POLL_CONCURRENCY=16
```

Confirm in worker logs after deploy.

## Concurrent Generation Smoke

Create a temporary flow and run three target-node image generations:

```bash
TAPFLOW_API_BASE_URL=https://art.aittco.com \
TAPFLOW_ACCESS_TOKEN=<token> \
TAPFLOW_TENANT_ID=<tenant-id> \
npm run smoke:concurrent-runs -- --count 3 --prompt "staging concurrent smoke"
```

Use an existing flow:

```bash
npm run smoke:concurrent-runs -- --flow-id <flow-id> --count 3 --timeout-ms 180000
```

Warnings are emitted when create-run latency exceeds 2 seconds or provider start spread exceeds 5 seconds.

## Cleanup Stuck Runs

Dry-run first:

```bash
npm run cleanup:stuck-runs -- --tenant-id <tenant-id> --after 2026-05-22T17:00:00Z --before 2026-05-22T17:30:00Z --reason "Upstash Redis quota exceeded during staging test"
```

Apply:

```bash
npm run cleanup:stuck-runs -- --tenant-id <tenant-id> --after 2026-05-22T17:00:00Z --before 2026-05-22T17:30:00Z --reason "Upstash Redis quota exceeded during staging test" --apply
```

The cleanup only marks clearly orphaned `pending` workflow runs and `runnable` node runs that never started. It does not touch succeeded, running, failed, or waiting-provider runs.

## Asset and Workspace Performance Smoke

Perform these checks after a performance-related deployment:

1. **Warm up cache:** Open `/workspace` and the canvas asset drawer once.
2. **Check instant remount:** Navigate away and return; verify there is no visible loading state on return to `/workspace` or on reopening the asset drawer.
3. **Verify inline covers:** In browser Network, confirm `/api/v2/projects?includeCoverUrl=true` is called and returns `coverUrl`.
4. **Verify inline previews:** In browser Network, confirm `/api/v2/assets?includePreviewUrls=true` is called and returns `previewUrl`.
5. **Check summary counts:** In browser Network, confirm `/api/v2/assets/summary` is called once for counts.
6. **Verify grid virtualization:** Open `/assets` with at least 100 images; scroll and confirm rendering remains responsive without a long blank grid.
7. **Diagnostic marks:** Check browser Console/Performance for `asset-library-refresh` and `workspace-projects-refresh` measures.

## TapFlow Agent Smoke

Use this after deploying the agent bridge package and before broader manual testing:

```bash
TAPFLOW_API_URL=https://api-art.aittco.com \
TAPFLOW_ACCESS_TOKEN=<token> \
TAPFLOW_PROJECT_URL=https://art.aittco.com/projects/<project-id>/canvas \
npm run smoke:tapflow-agent
```

If you need to reuse an existing session:

```bash
TAPFLOW_API_URL=https://api-art.aittco.com \
TAPFLOW_ACCESS_TOKEN=<token> \
TAPFLOW_PROJECT_ID=<project-id> \
TAPFLOW_FLOW_ID=<flow-id> \
TAPFLOW_AGENT_SESSION_ID=<session-id> \
npm run smoke:tapflow-agent
```

Expected result:

- the session is created or reused
- `POST /api/v2/agent/sessions/:sessionId/canvas-ops` returns `canvas_op_applied`
- the returned draft revision advances
- `TAPFLOW_PROJECT_URL` is enough to resolve the target project and flow
- no secret material appears in the output

## Production Suite Catalog Smoke

Use this after installing/publishing the production image routes and the local FFmpeg video editor route, before manual canvas testing:

```bash
TAPFLOW_API_URL=https://api-art.aittco.com \
TAPFLOW_ACCESS_TOKEN=<token> \
npm run smoke:production-suite-catalog
```

Expected result:

- at least one priced image route exposes `standard`, `panorama_360`, `wraparound_270`, and `subject_orbit_270`
- `video.editor.ffmpeg` exposes `video_editor_export`
- both the image production route and the FFmpeg export route have positive route pricing
- the smoke only reads model catalog route metadata and does not enqueue generation or consume credits

## Notes

- Target-node runs must not use `flows FOR UPDATE`.
- Target-node snapshots should reuse `flow_id + checksum` and recover from `23505` conflicts.
- Provider calls must run outside long DB transactions.
- Draft patching remains target-node-only after provider success.

## Prompt Catalog Media Variant Rollout

Prompt catalog media remains in the dedicated server directory mounted at `/var/lib/tapflow/prompt-catalog`; this procedure does not read from or write to S3.

After building images and stopping `tapflow-worker`, run the database migration first:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/cli.js
```

Inspect the historical-media plan without writing files or database keys:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-api npm run prompts:backfill-variants -- --dry-run --concurrency 4
```

Generate missing 640px thumbnails and 1600px previews:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-api npm run prompts:backfill-variants -- --concurrency 4
```

The command is idempotent: it retains existing derived keys/files and reports processed, generated, skipped, and failed counts. A missing derived file does not block users because the authenticated media endpoint falls back to the original. Rollback the application by redeploying the earlier commit; keep generated WebP files because old releases ignore them.
