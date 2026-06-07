# AI Gateway Admin V2 Final Verification

Date: 2026-06-07
Status: Phase 10 complete

This checklist is the final acceptance and deployment guide for the AI Gateway admin v2 upgrade.

It covers:

- admin end-to-end verification
- staging/production deployment with Docker Compose v2
- post-deploy smoke checks
- rollback guardrails

---

## 1. Expected Admin Information Architecture

Daily admin operations must follow this split:

- Model Center: product models, runtime lines, default line, pricing, route tests
- Provider Connections: provider resources, API keys, base URLs, reusable runtime connections
- Template Library: initialization only, not the daily management surface

If the UI still encourages daily route management through Template Library, the rollout is not complete.

---

## 2. End-to-End Admin Acceptance Checklist

### 2.1 Account and page entry

- [ ] Admin can open `/account`
- [ ] Admin can open `/account/ai-settings`
- [ ] Admin can open `/account/provider-settings`
- [ ] Admin can open `/account/template-library`
- [ ] Viewer/non-admin cannot manage provider/model/route resources

### 2.2 Product models and lines

- [ ] Model Center only shows intended product models
- [ ] A product model can have multiple lines under the same model
- [ ] Each line can use a different provider connection
- [ ] Each line can use a different upstream model
- [ ] Admin can mark one line as default
- [ ] Admin can disable a broken line without deleting history
- [ ] Admin can duplicate a line
- [ ] Admin can edit a line and save changes

### 2.3 Provider connections

- [ ] Admin can create multiple provider connections for one provider
- [ ] A provider connection can bind one credential and one base URL
- [ ] One provider connection can be reused by multiple lines
- [ ] Deleting a connection in use is blocked
- [ ] Connection list does not expose raw secret values

### 2.4 Template library behavior

- [ ] Template Library can initialize a provider/model/route bundle
- [ ] Template install creates or updates a provider connection
- [ ] Template install writes route `connection_id`
- [ ] Template install writes route `upstream_model`
- [ ] Template install writes route `api_mode`
- [ ] Template install writes route `request_path`
- [ ] Post-install edits happen in Model Center / Provider Connections, not inside Template Library

### 2.5 Legacy route compatibility

- [ ] Existing GPT-Image-2 routes still run
- [ ] Existing Nano Banana routes still run
- [ ] Existing route keys remain unchanged
- [ ] Existing pricing still resolves correctly
- [ ] Existing billing reserve/settle/refund still works

### 2.6 Debugging and diagnostics

- [ ] Route test API returns provider request summary without leaking API key
- [ ] Call logs include product model key
- [ ] Call logs include route snapshot fields
- [ ] Call logs include connection snapshot fields
- [ ] Health checks are visible for troubleshooting
- [ ] Frontend payloads and browser network logs do not expose raw provider secrets

### 2.7 Frontend behavior

- [ ] Model list does not flash legacy/unfiltered models before settling
- [ ] Route list does not flash stale line counts before settling
- [ ] Canvas users only see product model display names and friendly line labels
- [ ] Canvas users do not see provider vendor details unless explicitly intended

---

## 3. Model-Specific Smoke Checklist

### 3.1 GPT-Image-2

- [ ] Product model shows as `GPT-Image-2`
- [ ] Line 1 can run with its configured upstream model
- [ ] Line 2 can run with its configured upstream model
- [ ] Switching lines changes actual upstream payload behavior
- [ ] Size payload sent upstream is `auto` or concrete pixel size, never raw `1k/2k/4k`

### 3.2 PixelleLabs Nano Banana

- [ ] Product model `Nano Banana Pro` works with its own API key
- [ ] Product model `Nano Banana 2` works with its own API key
- [ ] The two PixelleLabs models do not share credentials accidentally
- [ ] Route labels are friendly line labels such as `线路一`, `线路二`

---

## 4. Server Deployment Checklist

Primary deployment path:

- project path: `/opt/aittco/tapflow`
- compose file: `docker-compose.staging.yml`
- env file: `/opt/aittco/env/tapflow.staging.env`

Do not use the legacy root `docker-compose.yml` for the current v2 deployment path.

### 4.1 Pre-deploy checks

- [ ] Confirm target git commit
- [ ] Confirm env file exists on server
- [ ] Confirm new env vars were added to both env file and `x-tapflow-env`
- [ ] Confirm Postgres backup policy
- [ ] Confirm worker can be safely paused
- [ ] Confirm Redis is healthy

### 4.2 Deploy commands

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

### 4.3 Post-deploy checks

- [ ] `tapflow-api` healthy
- [ ] `tapflow-worker` healthy
- [ ] `tapflow-frontend` healthy
- [ ] DB migration completed successfully
- [ ] No worker crash loop
- [ ] No API error loop

---

## 5. Post-Deploy Smoke Flow

Run this in staging first, then production.

### 5.1 Admin smoke

- [ ] Login as admin
- [ ] Open Account page
- [ ] Open Model Center
- [ ] Open Provider Connections
- [ ] Open Template Library
- [ ] Confirm intended product models only
- [ ] Confirm intended line count per model

### 5.2 Route smoke

- [ ] Test one GPT-Image-2 line from Model Center
- [ ] Test one Nano Banana line from Model Center
- [ ] Disable one non-default line and confirm UI refreshes correctly
- [ ] Re-enable or publish the needed line if required

### 5.3 Canvas smoke

- [ ] Open a project canvas
- [ ] Create one image generation node with GPT-Image-2
- [ ] Create one image generation node with Nano Banana
- [ ] Confirm workflow run finishes
- [ ] Confirm output asset is created
- [ ] Confirm billing reserve/settle path completes

### 5.4 Safety smoke

- [ ] Browser network payloads contain no raw provider key
- [ ] API responses contain no raw provider key
- [ ] Worker logs contain no raw provider key
- [ ] Failed provider call refunds or releases reserved credits

---

## 6. SQL / Runtime Inspection Shortcuts

Check service status:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml ps
```

Tail logs:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml logs --tail=200 tapflow-api tapflow-worker
```

Inspect one workflow run:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml exec -T tapflow-api \
  node packages/db/dist/cli.js
```

Use direct SQL or a short node script inside the API container when checking:

- `workflow_runs`
- `node_runs`
- `workflow_run_events`
- `assets`
- `ai_routes`
- `ai_provider_connections`
- `ai_call_logs`

---

## 7. Rollback Guardrails

If the issue is route/provider specific:

1. Set the broken route status to `inactive`
2. Keep historical route and billing records
3. Keep worker stopped only if jobs are actively failing
4. Fix connection/base URL/upstream model and redeploy

If the issue is release-wide:

1. Stop worker
2. Roll back code to previous known-good commit
3. Rebuild and restart services
4. Restore DB only if absolutely required and after backup/approval

Do not delete:

- billing ledger history
- workflow run history
- route history used for debugging

---

## 8. Validation Commands Run In This Phase

These are the baseline validation commands for the final verification phase:

```bash
npm run build
npx vitest run apps/api/test/ai-plugins.test.ts packages/db/test/ai-plugin-packages.test.ts
```

If database-backed tests are skipped locally, document that clearly and rerun them in an environment with database test support.

