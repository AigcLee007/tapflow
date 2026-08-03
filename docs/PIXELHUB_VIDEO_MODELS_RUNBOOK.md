# PixelHub Video Models Runbook

## Install Prerequisites

- Install built-in package `pixelhub.video` from Model Center.
- Supply the real HTTPS API base URL through `baseUrlOverride`.
- Supply the Bearer secret through the credential input so CredentialVault stores it.
- Do not add a PixelHub secret to frontend configuration, node data, Compose, repository files, logs, or screenshots.
- Confirm the resulting Provider Connection uses adapter kind `pixelhub-video` and is scoped to the intended tenant.

## Inactive Route Verification

- Install or publish the three routes as `inactive` first:
  - `video.pixelhub.gemini-omni-flash` -> upstream model `gemini-omni-flash`
  - `video.pixelhub.sora-v3-pro` -> upstream model `sora-v3-pro`
  - `video.pixelhub.veo31-fast` -> upstream model `veo31-fast`
- Confirm every route has request path `/v1/videos`, poll path `/v1/videos/{task_id}`, 12-second poll interval, and a 30-minute provider-task timeout.
- Confirm each route has one exact active `video_generation` pricing row with `billingBasis: duration_second`:
  - Gemini Omni Flash: 1 credit/second
  - Sora V3 Pro: 10 credits/second
  - Veo 3.1 Fast: 0.5 credit/second
- Confirm `upstream_model` is the exact listed upstream model, not an AI model or catalog UUID.
- Run one inactive admin route test per model. Confirm the sanitized request and response summaries do not disclose credentials, authorization headers, signed asset URLs, provider response bodies, or prompts.

## Canvas Smoke Matrix

Use a disposable project and tenant-owned assets. Start a fresh run for every matrix row. Confirm the reserve, settle or refund, and asset behavior for each run.

| Product model | Supported smoke inputs |
| --- | --- |
| Gemini Omni Flash | text; one main image; 2-5 image references; one source video with optional reference images |
| Sora V3 Pro | text; one main image; 2-9 image references; mixed references with at least one visual input when audio is present |
| Veo 3.1 Fast | text; one first frame; ordered first and last frame |

For every run, verify:

- the saved node contains the stable route key, schema-v2 parameters, ordered reference metadata, asset IDs, and upstream source node IDs only;
- the submitted request uses the selected upstream model, requested duration, aspect ratio, and only provider-approved reference fields;
- credits are reserved once, settled once after success, or refunded once after provider failure or the deadline;
- a completed remote video is copied into object storage, recorded in `assets` as video media, appears in `/assets`, and is referenced by asset ID from the canvas output;
- drafts, queue jobs, diagnostics, AI call summaries, and screenshots contain no signed reference URL, remote output URL, media bytes, `File`, `Blob`, `data:` URI, or credential.

## Activation

- Activate one route only after every smoke for that product passes.
- Verify the active creator catalog exposes only Gemini Omni Flash, Sora V3 Pro, and Veo 3.1 Fast as PixelHub video-generation products; do not expose mock, editor-only, inactive, unconfirmed, or non-exact-price routes.
- Recheck model controls after activation:
  - Gemini: `16:9`/`9:16`, `720P`/`1080P`, `4/6/8/10` seconds, fixed generated audio.
  - Sora: supported ratios, fixed `720P`, integer `4..15` seconds, generated-audio toggle.
  - Veo: `16:9`/`9:16`, fixed `1080P`, `4/6/8` seconds, fixed generated audio.
- Observe one completed task and one controlled failed task per activated route before treating the route as production-ready.

## Rollback

- Set the affected route status to `inactive`; do not delete it.
- Do not delete pricing history, AI call logs, usage events, assets, workflow records, or billing ledger rows.
- Stop the worker before deploying a code rollback that changes workflow behavior, then use the v2 Compose deployment order in `AGENTS.md`.
- Keep remaining routes active only if their own smoke matrix and billing checks remain valid.
