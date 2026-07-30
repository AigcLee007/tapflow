# Production Deployment Plan

Date: 2026-05-20
Branch: production-readiness

## B1. Environment Variable Inventory

Use placeholders only. Do not commit real values.

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
DATABASE_URL=<Supabase-Transaction-Pooler-connection-string-port-6543>
MIGRATION_DATABASE_URL=<Supabase-Direct-or-Session-Pooler-connection-string-port-5432>
API_DATABASE_ROLE=<PostgreSQL role name used by DATABASE_URL>
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_SSL=true
```

Required:

- Backup production DB before migration.
- Migration must run once per deployment.
- Stop deployment immediately if migration fails.
- Keep both URLs only in the external server environment file and never print them or place them directly in shell commands.
- Keep `DATABASE_URL` on port 6543 for API/Worker runtime. Scope `MIGRATION_DATABASE_URL` on port 5432 only to the one-shot `tapflow-migrator` service.
- Set `API_DATABASE_ROLE` to the runtime role name from `DATABASE_URL`; it is passed to the migrator only so wallet function ACLs can be repaired when migration and runtime connections use different Supabase roles.

Observed Supabase staging constraints for personal-wallet migrations:

- the runtime Transaction Pooler on port 6543, Session Pooler on port 5432, and the original migration-`000044` SQL Editor bundle all terminated during its role/ownership DDL;
- the Direct database hostname resolved IPv6-only from the deployment server, whose missing IPv6 route returned `ENETUNREACH`;
- migrations `000044` and `000045` remain pending until their revised managed-role sequence is applied and verified.

When Direct connectivity and both managed poolers are unavailable, the Supabase SQL Editor is an approved fallback only after the compatibility change is committed, pushed, and deployed. Generate each editor bundle from the exact deployed migration source and checksum, verify that checksum against the deployed commit, and apply one transaction at a time: `000044` first, verify its `schema_migrations` row, then `000045` and its row. Never combine both migrations into one editor execution or reuse an older generated bundle.

Run compiled schema and wallet migration CLIs through the dedicated migrator:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/cli.js
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/personal-wallet-migration-cli.js --dry-run
```

Keep the Worker stopped until schema migration, legacy reservation reconciliation, wallet dry run, and confirmed wallet write are complete. Only after the dry-run acceptance gate passes, run:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/personal-wallet-migration-cli.js --write --confirm PERSONAL_WALLET_CUTOVER
```

### Redis / Queue

```env
REDIS_URL=redis://<host>:6379
QUEUE_PREFIX=aigc-flow:prod
WORKER_CONCURRENCY=2
```

Required:

- Staging and production `QUEUE_PREFIX` must differ.
- Workers can scale horizontally.
- Billing correctness relies on idempotency keys.

### Object Storage

```env
S3_ENDPOINT=https://<object-storage-endpoint>
S3_REGION=<region>
S3_BUCKET=aigc-flow-prod
S3_ACCESS_KEY_ID=<access-key-id>
S3_SECRET_ACCESS_KEY=<secret-access-key>
S3_FORCE_PATH_STYLE=false
```

Required:

- Bucket must be private.
- Worker writes with server-side credentials only.
- Frontend accesses assets via `assetId` + safe API path.
- `flow_drafts` must not store base64/data URL/blob/signed URL as authoritative data.

### Credential Vault

```env
CREDENTIAL_MASTER_KEY=<base64-32-byte-key>
CREDENTIAL_KEY_VERSION=v1
```

Required:

- `CREDENTIAL_MASTER_KEY` must not be lost.
- Losing it makes existing provider credentials undecryptable.
- Key rotation requires a controlled migration/rotation plan.
- Any suspected exposure of the current key requires human-led credential rotation before broader rollout.

### Provider

```env
OPENAI_COMPAT_BASE_URL=https://sub.siphonlab.cn/v1
OPENAI_COMPAT_IMAGE_TIMEOUT_MS=120000
```

Notes:

- `OPENAI_API_KEY` is only for seed/import workflows if needed.
- Frontend must never use provider keys.
- Production provider credentials must be stored in CredentialVault.

### Admin

```env
ADMIN_EMAILS=admin@example.com
```

Document and enforce the admin permission bootstrap path.

### XunhuPay Personal Wallet

```env
PAYMENTS_ENABLED=false
XUNHU_APP_ID=<merchant-app-id>
XUNHU_APP_SECRET=<merchant-app-secret>
XUNHU_BASE_URL=https://api.xunhupay.com
XUNHU_NOTIFY_URL=https://api.example.com/api/v2/billing/payment/xunhu/notify
XUNHU_RETURN_URL=https://app.example.com/billing
XUNHU_TIMEOUT_MS=10000
PAYMENT_RECONCILE_INTERVAL_MS=60000
BILLING_EXPIRY_SWEEP_MS=300000
```

The API receives these variables through `x-tapflow-env`; the worker must not log or consume merchant values. Keep checkout disabled through migration and personal-wallet charging verification. Do not enable `PAYMENTS_ENABLED=true` until the public callback, duplicate callback, CNY 9.90 purchase, reconciliation, and fully unused refund acceptance checks have been recorded.

### Observability

```env
SENTRY_DSN=<optional>
REQUEST_ID_HEADER=x-request-id
```

If Sentry/metrics are not implemented, keep as P1 follow-up.

## B2. .env Example Policy

If adding `.env.example.production`, use placeholders only.

Real secrets must be injected only via:

- deployment platform secret manager
- external host-level env file outside the repository
- CI/CD secret store

Do not rely on repository-tracked staging or production env files as the source of truth.

Never commit:

- `.env.production`
- `.env.staging`
- real API keys
- real DB passwords
- real JWT secrets
- real `CREDENTIAL_MASTER_KEY`
- real external-object-storage credentials

## Launch Policy

- Real payment is not integrated.
- Before payment integration, launch posture is internal/manual-credit beta only.
- Public paid launch requires payment provider + callbacks + reconciliation controls.
- Staging launch: YES.
- Private beta launch: YES (internal/manual-credit only).
- Public production launch: NO.

## Security Policy

- No real API keys are committed.
- Provider credentials are server-side only.
- Credential material must never appear in frontend payloads.
- If a repo-local staging/production env file is discovered (for example `tapflow.staging.env`), treat it as a potential exposure event: remove it from planned commits, rotate the relevant secrets, and re-verify rollout readiness before continuing.

## Media Asset Performance

Generated images are stored as `original` objects and rendered through `asset_variants`:

- `thumb`: 320px WebP for asset grids
- `preview`: 1024px WebP for canvas nodes and preview modals
- `original`: full quality object for download, editing, and fullscreen high-quality viewing

Production object storage should be fronted by CDN or an equivalent accelerated endpoint. Canvas and `/assets` must not use original URLs for initial rendering.
