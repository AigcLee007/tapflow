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

## Canvas Smoke Matrix

Use a disposable project and tenant-owned assets. Confirm reserve, settle/refund, asset persistence, and the absence of signed URLs or media bytes in drafts for each model.

| Product model | Supported smoke inputs |
| --- | --- |
| Gemini Omni Flash | text; one image; 2-5 image references; one source video with optional reference images |
| Sora V3 Pro | text; one image; 2-9 image references; mixed references with visual input when audio is present |
| Veo 3.1 Fast | text; one first frame; ordered first and last frame |

Activate a route only after its controlled success and failure runs pass billing, asset, and secret-boundary checks.

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

Stop `tapflow-worker`, rebind affected routes to the retained previous connection, restart the normal Compose services, and verify the route query again. Do not delete routes, credentials, call logs, or billing ledger records.
