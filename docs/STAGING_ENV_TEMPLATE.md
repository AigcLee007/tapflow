# Staging Environment Template

Project: TapFlow / aigc-flow  
Branch baseline: `main`  
Latest main: `818e210`  

Use this document to collect all human-provided staging deployment inputs before execution.
Do not commit real secrets into repository files.

---

## 1. Domain and Access

- `PUBLIC_APP_URL =`
- `API_BASE_URL =`
- `CORS_ALLOWED_ORIGINS =`
- `COOKIE_DOMAIN =`
- `HTTPS configured =` (Yes/No)
- `Certificate / CDN / Reverse proxy notes =`

---

## 2. Postgres Database

- `DATABASE_URL =`
- `DB_POOL_MIN =`
- `DB_POOL_MAX =`
- `DB_SSL =`
- `Database provider =`
- `Backup method =`
- `pg_dump tested =` (Yes/No)
- `Restore tested =` (Yes/No)

---

## 3. Redis / Queue

- `REDIS_URL =`
- `QUEUE_PREFIX = aigc-flow:staging`
- `WORKER_CONCURRENCY =`
- `Redis provider =`
- `Password/TLS enabled =` (Yes/No)
- `Isolated from prod =` (Yes/No)

---

## 4. Object Storage / S3

- `S3_ENDPOINT =`
- `S3_REGION =`
- `S3_BUCKET =`
- `S3_ACCESS_KEY_ID =`
- `S3_SECRET_ACCESS_KEY =`
- `S3_FORCE_PATH_STYLE =`
- `Bucket private =` (Yes/No)
- `Upload tested =` (Yes/No)
- `Read/Download tested =` (Yes/No)

---

## 5. Auth / JWT / Cookie

- `JWT_ACCESS_SECRET =`
- `JWT_REFRESH_SECRET =`
- `COOKIE_SECURE =`
- `COOKIE_DOMAIN =`
- `Token expiry strategy =`
- `Confirmed no dev secret usage =` (Yes/No)

---

## 6. Credential Vault

- `CREDENTIAL_MASTER_KEY =`
- `CREDENTIAL_KEY_VERSION =`
- `Master key storage location =`
- `Master key backup confirmed =` (Yes/No)
- `Key rotation plan =`

---

## 7. OpenAI-Compatible Relay

- `OPENAI_COMPAT_BASE_URL = https://sub.siphonlab.cn/v1`
- `OPENAI_COMPAT_IMAGE_TIMEOUT_MS = 120000`
- `Relay provider =`
- `Relay account =`
- `Relay API key storage location =`
- `Image model = gpt-image-2`
- `routeKey = image.openai`
- `Credential written in provider settings =` (Yes/No)
- `Generate success tested =` (Yes/No)
- `Failure refund tested =` (Yes/No)

---

## 8. Admin / Permissions

- `ADMIN_EMAILS =`
- `Staging admin user =`
- `Viewer test user =`
- `Admin permission bootstrap method =`
- `Viewer 403 verified =` (Yes/No)
- `Provider settings page admin-only verified =` (Yes/No)

---

## 9. Observability

- `LOG_LEVEL =`
- `SENTRY_DSN =`
- `REQUEST_ID_HEADER =`
- `Log storage location =`
- `Log redaction enabled =` (Yes/No)
- `Worker error alerting method =`
- `Provider timeout/429 alerting method =`

---

## 10. Deployment

- `Deployment platform =`
- `API deployment method =`
- `Frontend deployment method =`
- `Worker deployment method =`
- `Migration execution method =`
- `Health check available =` (Yes/No)
- `Rollback method available =` (Yes/No)

---

## 11. Staging Smoke Test Checklist

- [ ] login
- [ ] admin can open provider settings
- [ ] viewer gets 403
- [ ] image.openai visible in route selector
- [ ] image.openai generate success
- [ ] assets appear
- [ ] workspace result persists after refresh
- [ ] billing reserve/settle
- [ ] invalid key refund
- [ ] provider timeout refund
- [ ] logs contain no secret
- [ ] restart worker and run again
- [ ] update pricing and verify next run uses new price

---

## 12. Go / No-Go

Staging deploy allowed only when:

- [ ] all required env vars are filled
- [ ] no real secrets are committed
- [ ] DB backup plan exists
- [ ] object storage is private
- [ ] admin permission verified
- [ ] smoke test passed

Launch posture declarations:

- Real payment is not integrated.
- Private beta must operate as internal/manual-credit beta.
- Public production launch remains NO.
