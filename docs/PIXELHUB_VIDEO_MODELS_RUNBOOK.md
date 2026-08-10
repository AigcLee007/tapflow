# PixelHub Video Models Runbook

## Staging Update

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

Set provider keys only through the protected admin install flow or server-side vault. Optional environment names are `PIXELHUB_GEMINI_OMNI_FLASH_API_KEY`, `PIXELHUB_SORA_V3_PRO_API_KEY`, and `PIXELHUB_VEO31_FAST_API_KEY`.

## Install Prerequisites

- Install built-in package `pixelhub.video` from Model Center.
- Supply the real HTTPS API base URL through `baseUrlOverride`.
- Supply three route-scoped Bearer secrets so CredentialVault stores one credential per model route.
- Do not add a PixelHub secret to frontend configuration, node data, Compose, repository files, logs, or screenshots.

## Inactive Route Verification

Install or publish the three routes as `inactive` first. Confirm each route has its own Provider Connection and CredentialVault credential, both scoped to the intended tenant and using adapter kind `pixelhub-video`.

| Stable route key | Upstream model | Exact price |
| --- | --- | ---: |
| `video.pixelhub.gemini-omni-flash` | `gemini-omni-flash` | 1 credit/second |
| `video.pixelhub.sora-v3-pro` | `sora-v3-pro` | 10 credits/second |
| `video.pixelhub.veo31-fast` | `veo31-fast` | 0.5 credit/second |

- Confirm every route uses request path `/v1/videos`, poll path `/v1/videos/{task_id}`, 12-second polling, and a 30-minute provider-task timeout.
- Confirm `upstream_model` is the listed provider model rather than a catalog or database ID, and that the route has one exact `video_generation` duration-second price row.
- Run one inactive admin route test per model. Sanitized request and response summaries must not expose credentials, authorization headers, signed asset URLs, provider bodies, or prompts.

## Canvas Smoke Matrix

Use a disposable project and tenant-owned assets. Confirm reserve, settle/refund, asset persistence, and the absence of signed URLs or media bytes in drafts for each model.

| Product model | Supported smoke inputs |
| --- | --- |
| Gemini Omni Flash | text; 1-5 reference images; optional one source video with reference images |
| Sora V3 Pro | text; 1-9 reference images; mixed references with visual input when audio is present |
| Veo 3.1 Fast | text; one first frame; ordered first and last frame |

For every matrix run, confirm the saved node retains only the stable route key, schema-v2 parameters, ordered references, asset IDs, and upstream source-node IDs. Verify the selected upstream model, duration, ratio, and approved reference fields are sent; credits reserve once and settle or refund once; successful media is recorded as a video `assets` row, appears in `/assets`, and is referenced by asset ID only.

## Activation

Activate one route only after its controlled success and failure runs pass billing, asset, and secret-boundary checks. Then confirm the creator catalog exposes only the three formal PixelHub product labels and not mock, editor-only, inactive, unconfirmed, or non-exact-price routes.

- Gemini Omni Flash: `16:9` / `9:16`, `720P` / `1080P`, `4` / `6` / `8` / `10` seconds, generated audio fixed on.
- Sora V3 Pro: declared ratios, `720P`, integer `4..15` seconds, generated-audio toggle.
- Veo 3.1 Fast: `16:9` / `9:16`, `720P` / `1080P`, `4` / `6` / `8` seconds, generated audio fixed on.

Observe one completed task and one controlled failed task for each activated route before treating it as production-ready.

## Route Verification

Verify route, connection, credential fingerprint, status, and pricing without selecting encrypted secret fields:

```sql
SELECT route.route_key, connection.name AS connection_name,
  connection.id::text AS connection_id, credential.id::text AS credential_id,
  credential.secret_fingerprint, route.status, pricing.unit_credits,
  pricing.min_charge_credits
FROM ai_routes route
LEFT JOIN ai_provider_connections connection ON connection.id = route.connection_id
LEFT JOIN api_credentials credential ON credential.id = COALESCE(route.credential_id, connection.credential_id)
LEFT JOIN model_pricing pricing ON pricing.route = route.route_key
WHERE route.route_key IN ('video.pixelhub.gemini-omni-flash', 'video.pixelhub.sora-v3-pro', 'video.pixelhub.veo31-fast')
ORDER BY route.route_key;
```

The three route rows must have distinct connection IDs and credential fingerprints, with pricing of 1, 10, and 0.5 credits per second. Never select `encrypted_secret`, `nonce`, or `auth_tag`.

## Rollback

Set affected routes to `inactive`, stop `tapflow-worker`, and rebind them to the retained previous connection before restarting normal Compose services. Verify the route query again. Do not delete routes, credentials, call logs, usage events, assets, workflow records, or billing ledger records.
