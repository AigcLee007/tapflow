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
DATABASE_URL=postgres://<user>:<password>@<host>:5432/<db>
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_SSL=true
```

Required:

- Backup production DB before migration.
- Migration must run once per deployment.
- Stop deployment immediately if migration fails.

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

### Observability

```env
SENTRY_DSN=<optional>
REQUEST_ID_HEADER=x-request-id
```

If Sentry/metrics are not implemented, keep as P1 follow-up.

## B2. .env Example Policy

If adding `.env.example.production`, use placeholders only.

Never commit:

- `.env.production`
- `.env.staging`
- real API keys
- real DB passwords
- real JWT secrets
- real `CREDENTIAL_MASTER_KEY`

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
