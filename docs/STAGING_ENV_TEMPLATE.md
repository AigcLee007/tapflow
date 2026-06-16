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

- `DATABASE_URL =<secret: Supabase pooled Postgres connection string>`
- `DB_POOL_MIN =1`
- `DB_POOL_MAX =5`
- `DB_SSL =true`
- `Database provider =Supabase Postgres`
- `Backup method =Supabase scheduled backup + manual pg_dump before migration`
- `pg_dump tested =No`
- `Restore tested =No`

---

## 3. Redis / Queue


- `REDIS_URL = <secret: Upstash Redis TCP connection string>`
- `QUEUE_PREFIX = aigc-flow:staging`
- `WORKER_CONCURRENCY = 1`
- `Redis provider = Upstash Redis`
- `Password/TLS enabled = Yes`
- `Isolated from prod = Yes`
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

### Text model route

- `GPT-5.5`
  - Provider kind: `openai-compatible`
  - Base URL: `https://sub.siphonlab.cn`
  - Upstream model: `gpt-5.5`
  - Chat API: `/v1/chat/completions`
  - Responses API: `/v1/responses`
  - Route key: `text.gpt-5-5`
  - Pricing: `2` credits per text generation
  - Credential env placeholder: `SIPHONLAB_GPT_5_5_API_KEY = <secret: SiphonLab GPT-5.5 API key>`
  - Credential storage: server-side CredentialVault / template install only
  - Text node success tested = No
  - Agent planner success tested = No

Gemini native routes are documented as a future plan only. They are not required for the first staging deployment.

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
- `AGENT_TEXT_ROUTE_KEY = text.gpt-5-5`
- `Agent planner note = keep false until the GPT-5.5 text template is installed, published, and smoke-tested; false uses deterministic planning only`

---

## 10. Deployment

- `Deployment platform = RainYun VPS + Docker Compose`
- `API deployment method = Docker service running API behind reverse proxy at https://api-art.aittco.com`
- `Frontend deployment method = Vite static build served by reverse proxy at https://art.aittco.com`
- `Worker deployment method = Docker service / background worker process with no public port`
- `Migration execution method = One-off migration command before API/worker start; run only once per deploy`
- `Health check available = TBD: confirm API health endpoint before staging deploy`
- `Rollback method available = Redeploy previous git commit / Docker image; DB restore only if explicitly required`

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
- Provider credentials are server-side only.
