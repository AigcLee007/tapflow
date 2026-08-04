# Staging Environment Template

Project: TapFlow / aigc-flow  
Branch baseline: `main`  
Latest main: `b54e593`  

Use this document to collect all human-provided staging deployment inputs before execution.
Do not commit real secrets into repository files.

---

## 1. Domain and Access

- `PUBLIC_APP_URL =https://art.aittco.com`
- `API_BASE_URL =https://api-art.aittco.com`
- `CORS_ALLOWED_ORIGINS =https://art.aittco.com`
- `TRUST_PROXY =true`
- `SECURITY_HEADERS_ENABLED =true`
- `COOKIE_DOMAIN =.aittco.com`
- `HTTPS configured =Yes`
- `Certificate / CDN / Reverse proxy notes =TBD: configure HTTPS via hosting platform / reverse proxy. Planned domains: art.aittco.com and api-art.aittco.com.`

---

## 2. Postgres Database

- `DATABASE_URL =<secret: Supabase Transaction Pooler connection string, port 6543>`
- `MIGRATION_DATABASE_URL =<secret: Supabase Direct connection or Session Pooler connection string, port 5432>`
- `API_DATABASE_ROLE =<runtime PostgreSQL role name used by DATABASE_URL; no password>`
- `DB_POOL_MIN =1`
- `DB_POOL_MAX =5`
- `DB_SSL =true`
- `Database provider =Supabase Postgres`
- `Backup method =Supabase scheduled backup + manual pg_dump before migration`
- `pg_dump tested =No`
- `Restore tested =No`

Keep both database URLs only in `/opt/aittco/env/tapflow.staging.env`. The runtime URL remains scoped to API and Worker through `x-tapflow-env`; the migration URL is injected only into the one-shot `tapflow-migrator` service.

---

## 3. Redis / Queue


- `REDIS_URL = <secret: Upstash Redis TCP connection string>`
- `QUEUE_PREFIX = aigc-flow:staging`
- `WORKER_CONCURRENCY = 1`
- `ASSET_IMAGE_VARIANT_CONCURRENCY = 2`
- `WORKER_IMAGE_VARIANTS_MODE = sync`
- `Redis provider = Upstash Redis`
- `Password/TLS enabled = Yes`
- `Isolated from prod = Yes`

Keep image-variant work at concurrency `2` during the thumbnail rollout. The worker generates a 640px WebP `thumb` and a 1024px WebP `preview`; do not increase this setting until queue failures, CPU, and storage writes have been reviewed.
---

## 4. Object Storage / S3

- `S3_ENDPOINT = https://oss-ap-northeast-1.aliyuncs.com`
- `S3_REGION = ap-northeast-1`
- `S3_BUCKET = tapflow-staging-assets`
- `S3_ACCESS_KEY_ID = <secret: Alibaba Cloud RAM access key id>`
- `S3_SECRET_ACCESS_KEY = <secret: Alibaba Cloud RAM access key secret>`
- `S3_FORCE_PATH_STYLE = false`
- `Bucket private = Yes`
- `Upload tested = No`
- `Read/Download tested = No`

---

## 5. Auth / JWT / Cookie

- `JWT_ACCESS_SECRET = <secret: strong random JWT access secret>`
- `JWT_REFRESH_SECRET = <secret: strong random JWT refresh secret>`
- `API_RATE_LIMIT_MAX = 1000`
- `API_RATE_LIMIT_WINDOW_MS = 60000`
- `AUTH_RATE_LIMIT_MAX = 20`
- `AUTH_RATE_LIMIT_WINDOW_MS = 60000`
- `COOKIE_SECURE = true`
- `COOKIE_DOMAIN = .aittco.com`
- `Token expiry strategy = Use application default expiry; verify in staging`
- `Confirmed no dev secret usage = No`

### Auth Email Verification / Resend

- `RESEND_API_KEY = <secret: Resend sending API key>`
- `RESEND_FROM_EMAIL = art@art.aittco.com`
- `RESEND_FROM_NAME = Art-Aittco`
- `Resend art.aittco.com domain verified = No`
- `Real mailbox verification tested = No`

---

## 6. Credential Vault


- `CREDENTIAL_MASTER_KEY = <secret: base64 32-byte credential master key>`
- `CREDENTIAL_KEY_VERSION = v1`
- `Master key storage location = Password manager + staging secret/env panel`
- `Master key backup confirmed = No`
- `Key rotation plan = Manual rotation requires decrypt-and-reencrypt migration plan`

---


## 7. AI Relays / Providers

### Staging first route

- `Relay provider = SiphonLab`
- `OpenAI-compatible base URL = https://sub.siphonlab.cn/v1`
- `OpenAI image model = gpt-image-2`
- `OpenAI routeKey = image.openai`
- `OPENAI_COMPAT_IMAGE_TIMEOUT_MS = 120000`
- `Credential storage = CredentialVault / staging secret only`
- `Credential written in provider settings = No`
- `Generate success tested = No`
- `Failure refund tested = No`

### Current staging scope

For staging/private beta, only the following route is required:

- `image.openai`
  - Provider kind: `openai-compatible`
  - Model: `gpt-image-2`
  - API protocol: OpenAI-compatible image API
  - Credential: server-side only, stored in CredentialVault

### GPT-Image-2 route importer

The following values are one-time importer inputs. They must remain in the external server env file and must not be added to `x-tapflow-env` because API and Worker runtime resolve credentials from CredentialVault instead.

- `MOUXIHUB_GPT_IMAGE_2_API_KEY = <secret: MouxiHub GPT-Image-2 API key>`
- `PIXELLELABS_GPT_IMAGE_2_API_KEY = <secret: PixelleLabs GPT-Image-2 API key>`

The importer creates these inactive platform routes for `GPT-Image-2`:

- `image.gpt-image-2.mouxihub-official`: async `/v1/images/generations`, `12` credits.
- `image.gpt-image-2.pixellelabs-stable`: sync `/v1/images/generations`, `3` credits.

Run the documented dry-run before applying. Run the importer `--test` command for both inactive lines, then use the explicit publish command with the intended default route key. The publish command refuses to activate either line unless its current configuration revision has passed a route test.

### Aittco text relay

- Plugin package: `aittco.text-relay`
- Provider kind/key: `aittco-text-relay`
- Base URL: `https://api.aittco.com`
- Authentication: one shared Bearer Key, supplied only to the authenticated plugin-install API and stored in CredentialVault.
- Do not add `AITTCO_TEXT_RELAY_API_KEY` to `x-tapflow-env`, frontend variables, node data, screenshots, or committed files.
- No Compose environment variable is required for normal runtime requests; API and Worker read the encrypted credential reference from the installed plugin.

| Product model | Upstream model | API path | Credits | Route key |
| --- | --- | --- | ---: | --- |
| Gemini-3.1-pro | `gemini-3.1-pro-preview` | Gemini `generateContent` | 1 | `text.gemini-3-1-pro` |
| Gemini-3.5-flash | `gemini-3.5-flash-preview` | Gemini `generateContent` | 0.5 | `text.gemini-3-5-flash` |
| GPT-5.6-sol | `gpt-5.6-sol` | `/v1/chat/completions` | 2 | `text.gpt-5-6-sol` |
| GPT-5.6-terra | `gpt-5.6-terra` | `/v1/chat/completions` | 1 | `text.gpt-5-6-terra` |
| GPT-5.5 | `gpt-5.5` | `/v1/chat/completions` | 2 | `text.gpt-5-5` |
| Claude-Opus-5 | `claude-opus-5` | `/v1/messages` | 2.5 | `text.claude-opus-5` |
| Claude-Sonnet-5 | `claude-sonnet-5` | `/v1/messages` | 1.5 | `text.claude-sonnet-5` |
| Claude-Opus-4-8 | `claude-opus-4-8` | `/v1/messages` | 2 | `text.claude-opus-4-8` |

Install and test all eight routes before disabling the historical `siphonlab.gpt-5-5-text` package. The canvas model picker groups them as Gemini, GPT, and Claude from plugin catalog metadata.

---

## 8. XunhuPay Personal Wallet

Keep merchant credentials in `/opt/aittco/env/tapflow.staging.env`; never commit them or place them in frontend variables.

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

Before enabling payments: verify public HTTPS callback reachability, exact plain-text `success` acknowledgement, smallest CNY 9.90 purchase, duplicate callback idempotency, one personal wallet used in two workspaces, eligible unused-order refund, reconciliation, and secret-free logs.

### Future multi-relay / multi-protocol plan

Relay A:

- `relay-a-openai`
  - Provider kind: `openai-compatible`
  - Models:
    - `gpt-image-2`
  - Route keys:
    - `image.relaya.openai.gpt-image-2`
  - Credential: `CredentialVault`

- `relay-a-gemini`
  - Provider kind: `gemini-native`
  - Models:
    - `gemini-3-pro-image-preview`
    - `gemini-3.1-flash-image-preview`
  - Route keys:
    - `image.relaya.gemini.gemini-3-pro-image-preview`
    - `image.relaya.gemini.gemini-3-1-flash-image-preview`
  - Credential: `CredentialVault`

Relay B:

- `relay-b-openai`
  - Provider kind: `openai-compatible`
  - Models:
    - `gpt-image-2`
  - Route keys:
    - `image.relayb.openai.gpt-image-2`
  - Credential: `CredentialVault`

- `relay-b-gemini`
  - Provider kind: `gemini-native`
  - Models:
    - `gemini-3-pro-image-preview`
    - `gemini-3.1-flash-image-preview`
  - Route keys:
    - `image.relayb.gemini.gemini-3-pro-image-preview`
    - `image.relayb.gemini.gemini-3-1-flash-image-preview`
  - Credential: `CredentialVault`

Relay C:

- `relay-c-openai`
  - Provider kind: `openai-compatible`
  - Models:
    - `gpt-image-2`
  - Route keys:
    - `image.relayc.openai.gpt-image-2`
  - Credential: `CredentialVault`

Relay D:

- `relay-d-openai`
  - Provider kind: `openai-compatible`
  - Models:
    - `TBD`
  - Route keys:
    - `TBD`
  - Credential: `CredentialVault`

- `relay-d-gemini`
  - Provider kind: `gemini-native`
  - Models:
    - `TBD`
  - Route keys:
    - `TBD`
  - Credential: `CredentialVault`

### Rules

- `gpt-image-2` uses the OpenAI-compatible image API.
- `gemini-*` image models use the Gemini native API.
- Do not route Gemini native models through the OpenAI-compatible adapter.
- Each provider kind must have its own adapter.
- `openai-compatible` and `gemini-native` should be treated as separate provider kinds.
- Each relay/provider/model/route combination must have independent pricing.
- Each route must be tested for success and refund behavior.
- No real relay API keys are committed.
- Provider credentials are server-side only.

---


## 8. Admin / Permissions


- `ADMIN_EMAILS = aigclee@sina.com,lb20060807@gmail.com`
- `Staging admin user = aigclee@sina.com`
- `Viewer test user = lb20060807@126.com`
- `Admin permission bootstrap method = TBD: confirm production-safe admin bootstrap before staging deploy`
- `Viewer 403 verified = No`
- `Provider settings page admin-only verified = No`

---

## 9. Observability

- `LOG_LEVEL = info`
- `SENTRY_DSN = <optional secret: not configured yet>`
- `REQUEST_ID_HEADER = x-request-id`
- `Log storage location = deployment platform logs`
- `Log redaction enabled = Yes`
- `Worker error alerting method = manual log review for staging`
- `Provider timeout/429 alerting method = manual log review for staging; P1 to add alerting`

## 9.1 Agent Planner

- `AGENT_PLANNER_ENABLED = false`
- `AGENT_DIRECTOR_ENABLED = false`
- `VITE_AGENT_DIRECTOR_ENABLED = false`
- `VITE_VIDEO_COMPOSER_V2 = true`
- `AGENT_TEXT_ROUTE_KEY = text.gpt-5-5`
- `Agent planner note = keep false until the GPT-5.5 text template is installed, published, and smoke-tested; false uses deterministic planning only`
- `Agent director note = keep both director flags false for dark deployment. When enabled, the panel switches to the Phase 0-1 Director preview shell with durable history/event replay APIs while preserving the classic runtime as rollback.`
- `Video composer note = true enables the LibTV-style video composer. To roll back the frontend only, set VITE_VIDEO_COMPOSER_V2=false in /opt/aittco/env/tapflow.staging.env, rebuild tapflow-frontend with docker-compose.staging.yml, then restart tapflow-frontend. This does not change drafts, routes, billing, workers, or providers.`

## 9.2 Agent Executor

- `AGENT_EXECUTOR_ENABLED = false`
- `AGENT_EXECUTOR_REQUIRE_APPROVAL = true`
- `AGENT_EXECUTOR_MAX_TOOL_ROUNDS = 8`
- `AGENT_EXECUTOR_MAX_GENERATED_ITEMS = 8`
- `AGENT_EXECUTOR_MAX_ESTIMATED_CREDITS = 50`
- `AGENT_EXECUTOR_TURN_TIMEOUT_MS = 300000`
- `AGENT_EXECUTOR_TOOL_TIMEOUT_MS = 180000`
- `AGENT_EXECUTOR_ALLOW_BATCH_IMAGE = true`
- `AGENT_EXECUTOR_ALLOW_IMAGE_EDIT = false`
- `AGENT_EXECUTOR_ALLOW_VIDEO = false`
- `Agent executor note = keep false until text and image routes are installed, pricing is verified, and staging smoke tests pass. Fast rollback is setting AGENT_EXECUTOR_ENABLED=false.`

## 9.3 TapFlow Agent Bridge

- `TAPFLOW_API_URL = https://api-art.aittco.com`
- `TAPFLOW_PROJECT_ID = <project id>`
- `TAPFLOW_FLOW_ID = <flow id>`
- `TAPFLOW_ACCESS_TOKEN = <short-lived user token for smoke testing>`
- `TAPFLOW_AGENT_SESSION_ID = <optional existing agent session id>`
- `TapFlow agent note = use these values only for local or staging smoke validation; do not commit real tokens`

## 9.4 Production Suite Catalog Smoke

- `Production image route supports standard = No`
- `Production image route supports panorama_360 = No`
- `Production image route supports wraparound_270 = No`
- `Production image route supports subject_orbit_270 = No`
- `Production image route positive pricing verified = No`
- `tapflow.video-editor-ffmpeg plugin installed = No`
- `video.editor.ffmpeg route published and visible = No`
- `video.editor.ffmpeg positive pricing verified = No`
- `Production suite catalog smoke passed = No`

---

## 10. Deployment

- `Deployment platform = RainYun VPS + Docker Compose`
- `API deployment method = Docker service running API behind reverse proxy at https://api-art.aittco.com`
- `Frontend deployment method = Vite static build served by reverse proxy at https://art.aittco.com`
- `Worker deployment method = Docker service / background worker process with no public port`
- `Migration execution method = One-off migration command before API/worker start; run only once per deploy`
- `Health check available = TBD: confirm API health endpoint before staging deploy`
- `Rollback method available = Redeploy previous git commit / Docker image; DB restore only if explicitly required`
- `PROMPT_CATALOG_MEDIA_HOST_DIR = /opt/aittco/data/tapflow/prompt-catalog`
- `Prompt catalog media = Server-local persistent directory mounted into tapflow-api at /var/lib/tapflow/prompt-catalog; it is not S3-backed and must be included in server backups.`

---

## 11. Staging Smoke Test Checklist

- [ ] login
- [ ] registration requires the emailed code before a session is issued
- [ ] verified same-device login does not request another code within 30 days
- [ ] new-device login requires the emailed code
- [ ] resend remains disabled for 60 seconds and succeeds after the cooldown
- [ ] API and worker logs contain no Resend API key, Authorization header, verification code, challenge token, or trusted-device token
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
- [ ] production image route exposes and prices 360/270 production modes
- [ ] `video.editor.ffmpeg` visible and priced
- [ ] production suite catalog smoke passed

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
- Provider credentials are server-side only.
# PixelHub video credentials are server-side only. Use placeholders, never real keys.
PIXELHUB_GEMINI_OMNI_FLASH_API_KEY=
PIXELHUB_SORA_V3_PRO_API_KEY=
PIXELHUB_VEO31_FAST_API_KEY=
