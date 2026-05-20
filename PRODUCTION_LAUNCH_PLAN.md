# TapFlow / aigc-flow Production Launch Plan

## 0. Current Project Status

Current main baseline:

```txt
branch: main
main hash: 47bad50
origin/main hash: 47bad50
status: clean
```

Current milestones already merged into `main`:

```txt
✅ Mock AI Provider Dev Seed E2E
✅ Route-aware Pricing Match
✅ Model Route Selector UI
✅ OpenAI-compatible Image Provider
✅ Provider Settings Admin UI
✅ image.openai verified with relay https://sub.siphonlab.cn/v1 + gpt-image-2
✅ assets / assetId persistence
✅ billing reserve / settle / refund
✅ provider timeout refund path
✅ provider settings pricing 100 -> 200 affects real billing
✅ credential masked display
✅ secret exposure check passed
```

Explicitly not done yet:

```txt
❌ Real payment is not integrated
❌ Production deployment environment is not complete
❌ Production monitoring / alerts / backup / rollback are not complete
❌ Some DB integration tests are skipped when DB test env is missing
❌ Legacy migration 3 known npm test failures remain known non-blocking
```

Recommended launch posture:

```txt
First target: staging / private beta
Second target: limited production beta
Not recommended yet: public production + real paid launch
```

---

## 1. Objective for Codex

Create a new branch:

```bash
git checkout main
git pull origin main
git checkout -b production-readiness
```

This phase should focus only on:

```txt
Production Readiness Audit + P0 launch preparation
```

Do **not** do the following in this phase:

```txt
Do not integrate real payment
Do not integrate Gemini / Replicate / Fal
Do not build a full marketplace
Do not rewrite the workflow architecture
Do not fix legacy migration known failures unless they are confirmed production blockers
Do not merge main automatically
```

Expected outputs:

```txt
docs/PRODUCTION_READINESS.md
docs/PRODUCTION_DEPLOYMENT.md
docs/PRODUCTION_RUNBOOK.md
Minimal P0 production/security/deployment fixes if needed
Build and targeted test validation results
Clear staging/private beta/public production readiness decision
```

---

# Part A. Production Readiness Audit

Create:

```txt
docs/PRODUCTION_READINESS.md
```

## A1. Capabilities Already Available

Document the current `main` capabilities:

```txt
- User login / session / tenant
- Project canvas
- Workflow run creation
- Route selector
- image.default mock success
- image.fail mock refund
- image.openai OpenAI-compatible relay success
- Provider Settings Admin UI
- CredentialVault
- Route-aware pricing
- Billing reserve / settle / refund
- Object storage / assets
- assetId writeback and persistence
- Worker queue
- Local development guide
```

## A2. P0 Blocker Checklist

P0 definition:

```txt
P0 = must be completed before public production launch.
```

Audit and mark each item:

```txt
P0-1: Production env vars and secret management are complete
P0-2: Database migration, backup, and restore plan is complete
P0-3: Redis / queue / worker production strategy exists
P0-4: Object storage bucket / permissions / signed access strategy is clear
P0-5: CredentialVault master key production config and rotation plan are clear
P0-6: Admin/provider settings permissions are sufficient
P0-7: Tenant scope protections are sufficient
P0-8: Provider key never appears in frontend / node data / flow_drafts / logs
P0-9: Missing pricing returns PRICING_NOT_FOUND and does not enqueue
P0-10: Provider failure always refund/releases reserved balance
P0-11: Production CORS / cookie / JWT / HTTPS configuration is clear
P0-12: Logging redaction covers Authorization / token / API key / credential
P0-13: Staging smoke test is defined
P0-14: Rollback / emergency switches are defined
P0-15: If real payment is not integrated, product is explicitly limited to internal/manual-credit beta
```

Use this format for every P0 item:

```md
### P0-x: Title

Status: PASS / FAIL / NEEDS FIX / ACCEPTED RISK

Evidence:
- File path
- Test result
- Manual QA result
- SQL / API verification result

Risk:
- Short risk description

Fix:
- Specific fix plan if needed

Owner:
- Codex / Human / Later
```

## A3. P1 / P2 Follow-ups

P1 = strongly recommended before production, but can be accepted temporarily for controlled private beta.

P2 = can be iterated after launch.

At minimum include:

```txt
P1:
- DB integration tests running in CI
- Admin audit log
- Credential rotation full manual verification
- Provider settings dangerous-change confirmation dialogs
- Worker / queue metrics monitoring
- Provider rate limit / quota alerts
- Sentry or equivalent error reporting
- Staging E2E smoke script
- Asset cleanup / orphan asset strategy

P2:
- Real payment
- Gemini / Replicate / Fal
- Full model marketplace
- Finer-grained RBAC
- OpenTelemetry / APM dashboard
- Browser E2E automation
- Vite chunk optimization
```

---

# Part B. Production Deployment Env Plan

Create:

```txt
docs/PRODUCTION_DEPLOYMENT.md
```

## B1. Environment Variable Inventory

Do not write real values. Use placeholders only.

### API / Web

```env
NODE_ENV=production
PORT=3366
PUBLIC_APP_URL=https://app.example.com
API_BASE_URL=https://api.example.com
CORS_ALLOWED_ORIGINS=https://app.example.com
COOKIE_SECURE=true
COOKIE_DOMAIN=.example.com
JWT_ACCESS_SECRET=<strong-random-secret>
JWT_REFRESH_SECRET=<strong-random-secret>
LOG_LEVEL=info
```

### Database

```env
DATABASE_URL=postgres://<user>:<password>@<host>:5432/<db>
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_SSL=true
```

Must state:

```txt
- Backup production DB before migration
- Migration should run once
- Stop deployment if migration fails
```

### Redis / Queue

```env
REDIS_URL=redis://<host>:6379
QUEUE_PREFIX=aigc-flow:prod
WORKER_CONCURRENCY=2
```

Must state:

```txt
- staging and production QUEUE_PREFIX must differ
- workers may scale horizontally but billing must rely on idempotency keys
```

### Object Storage

```env
S3_ENDPOINT=https://<object-storage-endpoint>
S3_REGION=<region>
S3_BUCKET=aigc-flow-prod
S3_ACCESS_KEY_ID=<access-key-id>
S3_SECRET_ACCESS_KEY=<secret-access-key>
S3_FORCE_PATH_STYLE=false
```

Must state:

```txt
- bucket should be private
- worker uses server-side credentials to write
- frontend accesses via assetId / safe access path
- flow_drafts must not store base64 / data URL / signed URL as authoritative data
```

### Credential Vault

```env
CREDENTIAL_MASTER_KEY=<base64-32-byte-key>
CREDENTIAL_KEY_VERSION=v1
```

Must state:

```txt
- CREDENTIAL_MASTER_KEY must not be lost
- losing it makes existing provider credentials undecryptable
- key rotation needs a migration plan
```

### Provider

```env
OPENAI_COMPAT_BASE_URL=https://sub.siphonlab.cn/v1
OPENAI_COMPAT_IMAGE_TIMEOUT_MS=120000
```

Notes:

```txt
OPENAI_API_KEY may only be used for seed/import workflows.
Frontend must never use provider keys.
Production provider keys must be stored in CredentialVault.
```

### Admin

```env
ADMIN_EMAILS=admin@example.com
```

Or document the current admin permission bootstrap strategy.

### Observability

```env
SENTRY_DSN=<optional>
REQUEST_ID_HEADER=x-request-id
```

If Sentry / metrics are not implemented, list them as P1.

## B2. `.env.example.production`

If creating `.env.example.production`, it must contain placeholders only.

Never commit:

```txt
.env.production
.env.staging
real API keys
real database passwords
real JWT secrets
real CREDENTIAL_MASTER_KEY
```

---

# Part C. Security P0 Audit + Minimal Fixes

## C1. Secret Exposure Audit

Run and record:

```bash
git status
git diff --stat
git diff

rg -n "sk-[A-Za-z0-9]|OPENAI_API_KEY|S3_SECRET|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|CREDENTIAL_MASTER_KEY|Authorization|Bearer " .
```

Requirements:

```txt
- no real API key in code, docs, tests, snapshots, logs
- docs may contain sk-... or <YOUR_KEY> placeholders only
- tests may contain fake values such as sk-test-secret only
```

Check frontend/API responses:

```txt
- /api/v2/ai/routes
- /api/v2/admin/ai/providers
- /api/v2/admin/ai/models
- /api/v2/admin/ai/routes
- /api/v2/admin/ai/pricing
- /api/v2/admin/credentials
```

They must not return:

```txt
raw secret
encrypted_secret
nonce
auth_tag
CREDENTIAL_MASTER_KEY
full provider API key
```

## C2. Admin Permission Audit

Confirm:

```txt
/api/v2/admin/ai/* requireAuth + requireTenant + requirePermission
/api/v2/admin/credentials* requireAuth + requireTenant + requirePermission
/account/provider-settings is hidden or returns 403 for unauthorized users
viewer/non-admin backend request returns 403
no NODE_ENV=development bypass exists in production-relevant admin paths
```

If a dev bypass exists, fix it.

## C3. Tenant Scope Audit

Confirm:

```txt
route update can only update current tenant route
system/global route cannot be modified by ordinary tenant admin
credential list/rotate/delete only applies to current tenant
pricing upsert only applies to current tenant route's provider/model/route
tenant A cannot read/write tenant B config
```

If DB integration tests do not cover this, mark it P0/P1 and add staging smoke test coverage.

## C4. Input Validation Audit

Confirm:

```txt
baseUrlOverride only allows http/https
timeoutMs range is 1000 to 300000
status only allows active/inactive
pricing minChargeCredits / unitCredits must be positive integers with an upper bound
modelKey is not empty
routeKey format is valid
modality / unit are enums
```

Invalid input should return 400, never 500.

---

# Part D. DB / Migration / Backup Runbook

Create:

```txt
docs/PRODUCTION_RUNBOOK.md
```

## D1. Migration Preflight

Document:

```txt
1. Confirm commit hash
2. Stop or pause worker
3. Backup Postgres
4. Run migration
5. Verify migration
6. Start API
7. Start worker
8. Run smoke test
```

## D2. Backup Command Templates

Generic:

```bash
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M%S).sql
```

Windows / Docker dev example:

```bat
docker exec infra-postgres-1 pg_dump -U aigc_flow aigc_flow > backup.sql
```

## D3. Restore Template

```bash
psql "$DATABASE_URL" < backup.sql
```

Warning:

```txt
Production DB restore is high risk and should only be done during a maintenance window.
```

## D4. Legacy Migration 3 Known Failures

Document:

```txt
Current npm test has 3 known legacy migration failures.
Confirm they belong to legacy/local asset migration and do not affect current v2 AI provider / assets / billing production path.
Do not fix them in this phase unless confirmed production blocker.
```

---

# Part E. Worker / Queue / Billing Readiness

## E1. Worker

Check:

```txt
Can worker scale horizontally?
Is queue prefix environment-specific?
Can worker crash cause double charge?
Are job idempotency keys stable?
Are provider timeout/retry settings reasonable?
Is there a worker health check?
```

Record current idempotency keys:

```txt
reserve:<tenantId>:<workflowRunId>:<nodeRunId>
settle:<tenantId>:<workflowRunId>:<nodeRunId>
refund:<tenantId>:<workflowRunId>:<nodeRunId>
```

## E2. Billing

Confirm:

```txt
pricing missing -> PRICING_NOT_FOUND -> no enqueue -> no free execution
provider failed -> refund/release -> Reserved returns to 0
success only -> settle + usage event
admin pricing changes affect future runs only and do not mutate historical ledger
```

## E3. QA Checklist

Add to `docs/PRODUCTION_RUNBOOK.md`:

```txt
[ ] image.default mock success
[ ] image.fail mock refund
[ ] image.openai relay success
[ ] image.openai invalid key refund
[ ] provider timeout refund
[ ] pricing missing PRICING_NOT_FOUND
[ ] pricing update affects next billing
[ ] admin 403 for viewer
[ ] credential masked display
[ ] assets persist after refresh
[ ] workspace result persists after refresh
```

---

# Part F. Object Storage / Assets Readiness

Check and document:

```txt
Is production bucket private?
Does worker use server-side credentials?
Does frontend access only via assetId / safe download path?
Does flow_drafts avoid base64/data URL/provider URL/signed URL authoritative data?
Is MIME type validated?
Are large image sizes limited?
Is content-type set correctly?
Is there an orphan asset cleanup strategy?
```

If cleanup does not exist yet, list it as P1 unless it creates a security risk.

---

# Part G. Staging Plan

## G1. Staging Environment Requirements

Staging must have:

```txt
staging DB
staging Redis
staging object storage bucket
staging CredentialVault master key
staging JWT secrets
staging domain + HTTPS
staging relay key
staging admin user
staging QUEUE_PREFIX
```

## G2. Staging Smoke Test

Run:

```txt
[ ] login
[ ] admin can open /account/provider-settings
[ ] viewer gets 403
[ ] image.openai visible in route selector
[ ] image.openai generate success
[ ] assets appear
[ ] workspace result persists after refresh
[ ] billing reserve/settle
[ ] invalid key refund
[ ] provider timeout refund
[ ] logs contain no secret
[ ] restart worker and run again
[ ] update pricing and verify next run uses new price
```

Only allow production cutover after staging passes.

---

# Part H. Production Cutover Runbook

Add to `docs/PRODUCTION_RUNBOOK.md`.

## H1. Preflight

```txt
[ ] confirm git commit
[ ] confirm build artifact
[ ] confirm env vars
[ ] confirm DB backup
[ ] confirm Redis namespace
[ ] confirm S3 bucket
[ ] confirm admin user
[ ] confirm provider credential exists
[ ] confirm image.openai route exists
[ ] confirm pricing exists
[ ] confirm provider settings page access
```

## H2. Deploy

```txt
1. Stop worker
2. Backup DB
3. Run DB migrations
4. Deploy API
5. Deploy frontend
6. Start worker
7. Run health checks
8. Run smoke tests
```

## H3. Smoke Test

```txt
[ ] login
[ ] open provider settings
[ ] image.openai generate
[ ] assets appear
[ ] billing reserve/settle
[ ] invalid key refund
[ ] logs no secret
```

## H4. Rollback

```txt
1. Stop worker
2. Disable image.openai route if provider is broken
3. Roll back API/frontend version
4. Restore DB only if migration requires and after approval
5. Keep ledger immutable if possible
6. Verify no stuck reserved balance
```

## H5. Emergency Switches

```txt
- set route status inactive
- stop worker
- set worker concurrency 0
- rotate provider credential
- disable provider settings admin route
- revoke admin user permission
```

---

# Part I. Minimal Production CI

Required commands:

```bash
npm run build
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/db
npm run build --workspace @aigc-flow/worker
npm run build --workspace @aigc-flow/ai-gateway-core
```

Targeted tests:

```bash
npx vitest run \
  src/services/v2AiGatewayAdminApi.test.ts \
  src/services/v2AiRoutesApi.test.ts \
  src/flowCanvas/utils/runtimeRouteOptions.test.ts \
  packages/ai-gateway-core/test/runtime.test.ts \
  packages/ai-gateway-core/test/mock-provider-adapter.test.ts \
  apps/worker/test/worker.test.ts \
  apps/api/test/workflow-pricing-resolver.test.ts \
  src/flowCanvas/runtime/v2WorkflowRunner.test.ts
```

DB integration tests:

```txt
apps/api/test/ai-gateway.test.ts
workflow-runs DB tests
billing DB tests
```

Decision:

```txt
If admin tenant scope is only covered by skipped DB tests, DB CI is P0.
If code review + manual QA temporarily substitute, staging smoke test must cover it.
```

---

# Part J. Real Payment Status

Current status:

```txt
Real payment is not integrated.
```

If launching before real payment, product must be positioned as:

```txt
internal beta
manual-credit beta
admin-granted balance
small allowlisted user group
```

Documentation must state:

```txt
No real payment integration.
No automatic recharge.
No public paid launch yet.
```

Public paid launch requires:

```txt
payment provider
orders
payment callback
credit top-up
refund accounting
invoice/receipt
fraud/rate limit
financial reconciliation
```

---

# Part K. Execution Order for Codex

## K1. Read-only Audit

Before changing code, output:

```txt
P0 blocker list
P1/P2 follow-up list
docs to add/update
whether code fixes are needed
```

## K2. P0 Minimal Fixes

If P0 blockers are found, fix P0 only. Do not fix P1/P2 unless trivial and safe.

## K3. Documentation

Must add/update:

```txt
docs/PRODUCTION_READINESS.md
docs/PRODUCTION_DEPLOYMENT.md
docs/PRODUCTION_RUNBOOK.md
docs/CODEX_HANDOFF.md
docs/v2-local-development.md
```

If any file is not appropriate to update, explain why.

## K4. Validation

Run:

```bash
npm run build
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/db
npm run build --workspace @aigc-flow/worker
npm run build --workspace @aigc-flow/ai-gateway-core
```

Run targeted tests:

```bash
npx vitest run \
  src/services/v2AiGatewayAdminApi.test.ts \
  src/services/v2AiRoutesApi.test.ts \
  src/flowCanvas/utils/runtimeRouteOptions.test.ts \
  packages/ai-gateway-core/test/runtime.test.ts \
  packages/ai-gateway-core/test/mock-provider-adapter.test.ts \
  apps/worker/test/worker.test.ts \
  apps/api/test/workflow-pricing-resolver.test.ts \
  src/flowCanvas/runtime/v2WorkflowRunner.test.ts
```

If DB tests are skipped, clearly say so. Do not report skipped tests as coverage passed.

---

# Part L. Final Response Format

Final response must include:

```txt
1. Branch name
2. Changed files
3. Production readiness summary
4. P0 blocker list
5. P0 fixes implemented
6. P1/P2 follow-ups
7. New/updated docs
8. Security/secret review result
9. Staging deployment plan
10. Production cutover runbook status
11. Validation results
12. Staging launch decision
13. Private beta launch decision
14. Public production launch decision
15. Explicit statements:
    - Real payment is not integrated
    - If launching before payment, product must operate as internal/manual-credit beta
    - No real API keys are committed
    - Provider credentials are server-side only
```

Launch decision format:

```txt
Staging launch: YES / NO
Private beta launch: YES / NO
Public production launch: YES / NO

Reason:
- ...
```

Do not downgrade P0 risks just to launch faster.
