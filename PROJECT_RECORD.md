# Project Record

Last updated: 2026-06-12
Maintainers: project team + Codex sessions

## Purpose

This file is the root-level running project record for the current TapFlow v2 product path.

Use it to track:

- current product status
- latest validated environment status
- common deployment and rollback commands
- important operational notes
- dated progress records for each meaningful improvement

Rule for future updates:

- after each meaningful product, infrastructure, deployment, or staging-validation change, update this file in the same task or immediately after

## Current Product Status

Repository direction:

- v2 authenticated AI Flow workspace product
- one user-facing project maps to one primary Flow canvas
- canvas draft persistence is server-side
- assets are backed by cloud object storage
- billing uses reserve / settle / refund server-side flow
- AI provider/model routing uses the v2 AI Gateway path

Primary user-facing routes:

- `/login`
- `/register`
- `/workspace`
- `/projects/:projectId`
- `/assets`
- `/billing`
- `/account`

Current deployment baseline:

- branch: `main`
- server path: `/opt/aittco/tapflow`
- compose file: `docker-compose.staging.yml`
- env file: `/opt/aittco/env/tapflow.staging.env`

## Current Key Status Snapshot

As of 2026-06-12:

- TapNow-style visual alignment work has been iterated several rounds on canvas layout, add-node menus, user menus, and node title density
- media asset preview optimization is implemented
- historical asset variant backfill script is implemented and validated on staging
- staging asset backfill has been executed successfully
- `/projects` and `/assets` loading experience improved and validated
- production/staging Docker image base Node version upgraded from 18 to 22
- staging runtime confirmed on Node `v22.22.3` for both API and worker
- local image upload smoothness root cause identified: upload entry points still wait for image decode/measurement before first canvas paint
- upload smooth preview execution plan added at `docs/superpowers/plans/2026-06-11-upload-smooth-preview-pipeline.md`
- image generation target-node input propagation fixed: upstream text nodes, image/upload asset nodes, and `batchCount` now reach the worker/provider request instead of remaining visual-only canvas state

## Recent Important Commits

- pending: fix image generation input propagation
- `b24b42f` chore: upgrade production image to node 22
- `767ba4a` fix: make asset variant backfill run in production
- `ebed8f2` feat: add preview-backed asset pipeline
- `4af5009` feat: speed up asset previews with variants
- `dc82771` fix: align tapnow menus and node title scale
- `0b17ff8` refine tapnow menu alignment and node labels
- `339452a` fix: restore upload node handle runtime style
- `58f9d0f` refine tapnow menu density and node labels

## 2026-06-11 - Upload Smooth Preview Pipeline Plan

- Root cause identified: image node upload, upload node upload, canvas drag upload, and canvas paste upload still wait for local image decode/measurement before the first visible canvas update.
- Current implementation also repeats local image preparation in upload hydration, which can decode the same large file more than once.
- Execution plan added: `docs/superpowers/plans/2026-06-11-upload-smooth-preview-pipeline.md`.
- Target behavior: immediate local canvas preview, async local lightweight preview, background original upload, and uploaded asset `thumb`/`preview` variants for fast refresh and `/assets` thumbnails.

## 2026-06-11 - Upload Smooth Preview Pipeline Execution

- Frontend upload entry points now use a shared immediate-preview pipeline: image node upload, upload node upload, drag upload, and paste upload all render a local image node before measurement or network upload.
- Local upload helpers were split into synchronous immediate node hydration, async local preview generation, async size measurement, and upload-only asset hydration so the first paint no longer waits on image decode.
- API fallback upload path now persists uploaded image `thumb` and `preview` variants when valid image bytes are available, aligning refreshed canvas rendering with the fast preview path already used for generated assets.
- Fresh validation completed:
  - `npm run test -- src/flowCanvas/utils/localImageUpload.test.ts src/flowCanvas/store/flowCanvasStore.test.ts src/assets/assetApi.test.ts`
  - `npm run build`
  - `npm run build --workspace @aigc-flow/api`
- Database-gated API asset tests are still environment-gated locally; `npm run test --workspace @aigc-flow/api -- test/assets.test.ts` returned skipped in the current environment rather than failing.

## 2026-06-12 - Image Generation Input Propagation Fix

- Root cause: target-node workflow runs were started before the latest remote draft was guaranteed to be saved, and the worker set target-node `upstreamOutputs` to an empty array. This meant connected text/image nodes could look correct on canvas but not reach the provider request.
- Frontend fix: added a remote draft save barrier before `runBackendWorkflow()` creates the backend run, so newly typed prompts, links, references, and batch count are flushed to the server draft first.
- Worker fix: target-node runs now resolve dependency outputs from existing node runs or from compiled upstream node config. Static text nodes contribute `text`; asset-backed image/upload nodes contribute `assets`.
- Provider input fix: upstream asset references are hydrated with signed object-storage URLs before media generation so image models can actually read the reference image.
- Batch fix: image node `batchCount` is normalized into provider-facing `metadata.n` and `metadata.params.n`, so selecting `2x` is sent as two requested outputs.
- Validation:
  - `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts`
  - `npm run test --workspace @aigc-flow/worker`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`
- Full `npm test` still has unrelated existing failures in legacy migration, ProjectCard/UploadAssetButton text assertions, storage presigned URL expectations, AI Gateway schema examples, and one OpenAI-compatible multipart test. The new worker/runner tests for this fix pass.

## 2026-06-12 - Prompt Bar Density Alignment

- Text, image, and video node selected-state PromptBars now share one compact density token set.
- PromptBar widths/heights were reduced toward TapNow-like viewport proportions:
  - text: `clamp(720px, 56vw, 1040px)`
  - image: `clamp(760px, 58vw, 1080px)`
  - video: `clamp(780px, 60vw, 1120px)`
- Prompt editor font size, line height, padding, bottom-row controls, and send button density were unified so the edit boxes no longer dominate the canvas.
- Validation:
  - `npm run test -- src/flowCanvas/utils/promptBarDensity.test.ts`
  - `npm run build`

## Common Staging Commands

Set reusable command variables:

```bash
cd /opt/aittco/tapflow

export ENV_FILE=/opt/aittco/env/tapflow.staging.env
export COMPOSE="docker compose --env-file $ENV_FILE -f docker-compose.staging.yml"
```

Update code to latest `main`:

```bash
cd /opt/aittco/tapflow
git fetch --all --prune
git checkout main
git pull --ff-only origin main
git rev-parse --short HEAD
```

Standard staging deploy:

```bash
cd /opt/aittco/tapflow

export ENV_FILE=/opt/aittco/env/tapflow.staging.env
export COMPOSE="docker compose --env-file $ENV_FILE -f docker-compose.staging.yml"

$COMPOSE build
$COMPOSE stop tapflow-worker
$COMPOSE run --rm tapflow-api node packages/db/dist/cli.js
$COMPOSE up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend
$COMPOSE ps
$COMPOSE logs --tail=100 tapflow-api tapflow-worker tapflow-frontend
curl -sS http://127.0.0.1:3366/health
```

Force rebuild specific runtime images:

```bash
$COMPOSE build --no-cache tapflow-api tapflow-worker tapflow-frontend
$COMPOSE up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend
```

Check service status:

```bash
$COMPOSE ps
$COMPOSE logs --tail=100 tapflow-api tapflow-worker tapflow-frontend
curl -sS http://127.0.0.1:3366/health
```

Restart runtime services:

```bash
$COMPOSE restart tapflow-api tapflow-worker tapflow-frontend
$COMPOSE ps
$COMPOSE logs --tail=100 tapflow-api tapflow-worker tapflow-frontend
```

Check runtime Node version in containers:

```bash
$COMPOSE run --rm tapflow-worker node -v
$COMPOSE run --rm tapflow-api node -v
```

## Media Asset Variant Commands

Dry-run historical asset backfill:

```bash
$COMPOSE run --rm tapflow-worker npm run assets:backfill-variants -- --dry-run --limit=20
```

Run historical asset backfill:

```bash
$COMPOSE run --rm tapflow-worker npm run assets:backfill-variants -- --limit=50
```

Repeat until the batch no longer prints meaningful new `[ok]` lines.

Backfill success indicators:

- dry-run prints `[dry-run] <asset-id>: thumb,preview`
- formal run prints `[ok] <asset-id>`
- no `ERR_MODULE_NOT_FOUND`
- no missing required env errors
- no sustained DB / S3 / image decode failures

## Staging Acceptance Checklist

Use after media-pipeline or runtime changes.

Projects page:

- page opens normally
- no black screen
- canvas nodes render normally
- historical images restore after refresh
- newly generated image shows in node
- newly generated image still exists after refresh
- browser console has no new errors
- first-screen image load is visibly faster than before

Assets page:

- first-screen asset thumbnails load faster
- historical images render correctly
- scroll loading continues correctly
- preview modal works
- original download works
- assets remain after refresh
- browser console has no new errors

Network spot-check:

- project canvas image preview requests should include `download-url?variantKey=preview`
- avoid first-screen dependence on original full-size image URLs

Health and logs:

- `tapflow-api`, `tapflow-worker`, `tapflow-frontend`, and `tapflow-redis` are up
- `/health` returns ok
- worker logs include `v2 worker runtime ready`
- API logs include `v2 api listening`

## Operational Notes

- `GET /` returning `404` from the API container is acceptable; it is not the main product route
- requests probing `/.git/config` are external scans, not application regressions
- migrations in runtime images must use `node packages/db/dist/cli.js`
- do not use root `docker-compose.yml` for the current v2 deployment path unless intentionally working on legacy deployment

## Known Non-Blocking Items

- Vite still emits chunk size warnings during frontend build
- some legacy migration tests remain known non-blocking failures outside the main v2 path
- Node 22 upgrade is now complete on staging, but production rollout still needs its own controlled deploy

## 2026-06-11 Work Log

### Goal

Improve real staging performance and alignment with TapNow-like behavior, especially around image preview loading and runtime smoothness.

### UI and Canvas Alignment Work

Completed across several commits:

- refined overall 100 percent scale presentation to better match TapNow feel
- adjusted add-node menu and user menu spacing/alignment behavior
- reduced menu density and node title size for closer TapNow visual balance
- fixed canvas/runtime black-screen issue caused by `plusHandle` reference error

Important commits in this area:

- `58f9d0f`
- `339452a`
- `0b17ff8`
- `dc82771`

### Upstream Image Auto-Reference Work

Completed in current working session:

- fixed the image-to-image chaining gap where runtime could use upstream images but the image node prompt bar still showed no active references
- image-to-image connect now auto-appends `upstream:<sourceNodeId>` into downstream `referenceOrder`
- graph upstream reference indexing now accepts image nodes backed by `thumbnailUrl`, `originalImageUrl`, generated result urls, or runtime image asset outputs
- asset-backed node data can now persist an optional preview url into referenceable image fields so imported asset nodes behave more like TapNow-style source images
- added focused regression tests for store auto-reference behavior and asset-backed image preview persistence

### Upstream Image Execution Wiring Fix

Completed in current working session:

- fixed the worker image-generation request builder so node-level `referenceImages` are forwarded into provider-facing request metadata
- this closes the gap where canvas UI showed an upstream image reference chip but the provider runtime still generated from prompt-only input
- added a focused worker unit test to lock the request-shaping behavior

Validation completed:

- `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
- `npm run build --workspace @aigc-flow/worker`
- `npm run build`

### Media Preview Performance Work

Completed:

- canvas runtime now prefers preview variants instead of original image URLs
- image nodes use preview-backed asset loading with fallback path
- added preview load state handling on image nodes
- added historical asset variant backfill script
- added deployment/runbook notes for media asset pipeline

Important commits:

- `4af5009` feat: speed up asset previews with variants
- `ebed8f2` feat: add preview-backed asset pipeline

### Backfill Production Compatibility Fix

Problem found on staging:

- backfill script originally imported source-only paths like `apps/api/src/...`
- production worker image only contained built runtime artifacts
- staging dry-run failed with `ERR_MODULE_NOT_FOUND`

Fix completed:

- rewrote backfill script to use runtime-safe env parsing
- removed runtime dependency on app source-path imports
- made the script work in production containers
- added a regression test for safe import/direct execution behavior

Commit:

- `767ba4a` fix: make asset variant backfill run in production

### Staging Backfill Result

Validated on staging:

- dry-run succeeded and printed `thumb,preview`
- formal backfill succeeded and printed `[ok]` asset lines
- repeated runs indicated historical backlog was substantially processed

### Staging Functional Acceptance Result

Validated by manual staging checks:

- `/projects/:projectId` page passed
- `/assets` page passed
- historical image nodes restore correctly
- new image generation shows correctly in project and assets library
- refresh persistence passed
- first-screen image loading was noticeably improved
- no new browser console errors were observed in accepted flows

### Network Verification Result

Validated:

- project canvas requests included `download-url?variantKey=preview`

This confirms the preview variant path is active in the project canvas.

### Node Runtime Upgrade

Reason:

- staging logs showed AWS SDK warning about future support cutoff for Node 18

Completed:

- upgraded Docker builder and production stages from `node:18-alpine` to `node:22-alpine`
- rebuilt staging images
- confirmed actual runtime Node version inside API and worker containers

Commit:

- `b24b42f` chore: upgrade production image to node 22

Validated staging runtime:

- `tapflow-worker` -> `v22.22.3`
- `tapflow-api` -> `v22.22.3`

### Final Status for 2026-06-11

Result:

- staging acceptance passed
- media asset preview pipeline passed
- historical asset backfill passed
- Node 22 runtime upgrade passed on staging

Next recommended focus:

- prepare production release checklist using the now-validated staging path
- continue updating this file after each meaningful improvement or deploy-related change

### Latest UI Framing Update

Completed in current local iteration:

- added a desktop page-scale shell to the project canvas page so browser zoom `100%` visually matches the prior `80%` framing target more closely
- compensated shell width and height to preserve full-viewport coverage after scale
- relaxed the previous extra React Flow density shrink so page-level scale does not double-compress the canvas

Validation completed:

- `npm run test -- src/flowCanvas/FlowCanvasPage.test.tsx`
- `npm run test -- src/flowCanvas/utils/viewportDensity.test.ts`
- `npm run build`

### Latest UI Positioning Fix

Completed in current local iteration:

- removed the page-level desktop `scale()` shell from the project canvas page after it caused widespread overlay and toolbar position drift
- restored the project page to a normal viewport coordinate system so fixed-position menus, toolbars, and canvas interaction anchors line up again
- kept the denser default project-page visual framing by moving the adjustment back into React Flow fitView and viewport density settings instead of page transforms

Validation completed:

- `npm run test -- src/flowCanvas/utils/viewportDensity.test.ts`
- `npm run build`

### Latest Left Dock Scaling Update

Completed in current local iteration:

- scaled only the left vertical project dock to `70%` of its prior visual size
- kept the bottom viewport control bar unchanged
- applied the reduction through a dock-local wrapper so the adjustment stays scoped to the red-box area only

Validation completed:

- `npm run build`

### Latest Add Menu Alignment Update

Completed in current local iteration:

- moved the add-node flyout closer to the left dock after the dock was visually reduced
- kept the menu height unchanged
- aligned the add-node flyout bottom edge to a fixed lower reference line instead of the prior top-anchor behavior

Validation completed:

- `npm run build`

### Latest Menu Consistency Update

Completed in current local iteration:

- unified the add-node flyout, user menu, pane quick-add menu, and connection menu onto one shared menu token set
- aligned menu width, radius, padding, item height, icon box sizing, title font size, and description font size to the same baseline
- moved the user menu onto the same left/right and bottom-line anchoring model as the add-node menu so the whole menu system reads as one family

Validation completed:

- `npm run build`

### Latest Local Image Upload Repair

Completed in current local iteration:

- fixed the shared local-image upload path used by empty image nodes, upload nodes, canvas drag/drop, and paste upload
- kept direct `presigned-upload` browser upload as the first path
- added automatic fallback to same-origin API proxy upload when browser direct upload fails with fetch/CORS-style failure
- added new API route `POST /api/v2/assets/:assetId/upload-bytes` for binary proxy upload into object storage
- added a shared frontend helper to hydrate uploaded asset-backed image nodes with signed preview or original download urls
- implemented real click-upload and drag-upload behavior for `UploadNode`
- upload nodes now convert into image nodes after successful upload instead of staying as a static placeholder shell

Validation completed:

- `npm run test -- src/assets/assetApi.test.ts src/flowCanvas/utils/localImageUpload.test.ts`
- `npm run build --workspace @aigc-flow/api`
- `npm run build --workspace @aigc-flow/worker`
- `npm run build`

Notes:

- `npm run test --workspace @aigc-flow/api -- assets.test.ts` was skipped locally because database test env was not configured in this machine session

### Latest Upload 413 Hotfix

Completed in current local iteration:

- traced the new upload regression to the same-origin fallback route `POST /api/v2/assets/:assetId/upload-bytes`
- confirmed the fallback route was receiving browser image uploads but Fastify rejected larger binary bodies with `413 FST_ERR_CTP_BODY_TOO_LARGE`
- raised the `application/octet-stream` parser body limit for the asset upload route to `25 MB`
- added a regression test case covering multi-megabyte proxied image upload behavior

Validation completed:

- `npm run build --workspace @aigc-flow/api`
- `npm run test --workspace @aigc-flow/api -- assets.test.ts` (skipped locally because DB env was not configured)
- `npm run build`

### Latest Canvas Upload Smoothness Upgrade

Completed in current local iteration:

- changed local image ingestion from a blocking “upload first, then render” flow to a two-phase “local preview first, background upload second” flow
- added immediate local `blob:` preview rendering for image-node upload, upload-node upload, drag-and-drop upload, and paste upload
- removed the drag/paste batch blocking behavior where `Promise.all(...)` delayed every node until the whole upload batch finished
- upload and paste interactions now insert image nodes immediately and backfill `assetId` plus cloud preview URL after upload completes
- upload nodes now convert into image nodes with visible local preview first, then upgrade to cloud-backed image nodes once upload settles
- failed uploads now keep the visible local image instead of looking like “nothing happened”

Validation completed:

- `npm run test -- src/flowCanvas/utils/localImageUpload.test.ts src/flowCanvas/store/flowCanvasStore.test.ts src/assets/assetApi.test.ts`
- `npm run build --workspace @aigc-flow/api`
- `npm run build`

### Latest Text-to-Image Generation UI Alignment

Completed in current local iteration:

- fixed the v2 generated-image writeback so successful runs preserve `lastGenerationSnapshot`, generated result metadata, active result, cover result, and natural image size
- fullscreen image viewer now receives the real generation prompt/model/size metadata instead of falling back to empty prompt state
- rebuilt the fullscreen viewer right panel as fixed header, scrollable prompt/info content, and fixed download footer to avoid info/download overlap
- changed the in-node generation state from a loud central status pill to a quieter TapNow-style dark image skeleton
- kept generated image result controls driven by real node/runtime data instead of visual-only placeholders

Validation completed:

- `npm run test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts`

### Latest Fullscreen Viewer Scrollbar Alignment

Completed in current local iteration:

- added a TapNow-style hover scrollbar to the fullscreen image viewer right-side metadata panel
- scoped the scrollbar styling to the image viewer panel only so canvas and menu scrollbars are not affected
- kept the download button fixed at the bottom while the prompt and info content remain scrollable

Validation completed:

- `npm run build`

### Latest Local Upload Reference Preview Fix

Completed in current local iteration:

- fixed asset-backed local upload image nodes so resolved preview URLs are written back to node data, not only kept in component-local state
- restored downstream image reference chips for uploaded local images after connecting them into another image generation node
- added an always-visible-on-hover right-side viewer scroll indicator so the fullscreen metadata panel shows a TapNow-style scrollbar cue even when browser native scrollbars stay hidden

Validation completed:

- `npm run test -- src/flowCanvas/store/flowCanvasStore.test.ts`
- `npm run build`

### Latest Generated Image Original Download Fix

Completed in current local iteration:

- fixed generated image downloads to resolve the original asset download URL before downloading
- updated main image download, fullscreen viewer download, and generated result strip download to prefer original asset URLs over preview WebP URLs
- added a small tested download helper for asset-result id parsing, original URL resolution, and filename extension selection

Validation completed:

- `npm run test -- src/flowCanvas/utils/imageDownload.test.ts`
- `npm run build`

### Latest Image Batch Count Execution and Billing Fix

Completed in current local iteration:

- traced the remaining `2x` generation issue to the backend execution and billing layers, not the canvas UI
- added AI Gateway sync-image fallback execution so adapters that return one image per call repeat until the requested `n` image count is reached
- kept async provider-task routes from being repeated automatically, because task count semantics must stay provider-controlled while polling
- updated workflow pre-reserve pricing to read `unit_credits` and multiply image-generation cost by the requested batch count
- added `pricingQuantity` into node run cost metadata and billing reserve metadata for easier staging ledger inspection

Validation completed:

- `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts`
- `npm test -- apps/api/test/workflow-pricing-resolver.test.ts`
- `npm run build --workspace @aigc-flow/api`
- `npm run build --workspace @aigc-flow/worker`
- `npm run build --workspace @aigc-flow/ai-gateway-core`
- `npm run build`

### Latest GPT-Image-2 Reference Batch Payload Fix

Completed in current local iteration:

- traced the `gpt-image-2` 3x failure with a reference image to the OpenAI-compatible Images edit payload
- confirmed the adapter was sending a single `/images/edits` multipart request with `n=3`
- changed `gpt-image-2` reference-image edit requests to ask the provider for one image per call, letting the AI Gateway repeat calls until the requested batch count is reached
- removed `response_format=b64_json` from GPT Image requests while keeping `b64_json` response parsing intact
- kept legacy/non-GPT Image request behavior compatible for providers that still expect `response_format`

Validation completed:

- `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts`
- `npm run build --workspace @aigc-flow/ai-gateway-core`
- `npm run build --workspace @aigc-flow/worker`
- `npm run build`

### Latest Canvas Multi-Selection Interaction Fix

Completed in current local iteration:

- changed canvas node selection behavior so multi-select is treated as its own batch operation mode instead of opening every selected node as an editor
- added a shared node selection mode helper that only allows single-node controls when exactly one node is selected
- suppressed text/image/video/upload/audio/image-editor/group node floating controls, resizers, prompt bars, result strips, and hover connection affordances during multi-selection
- made text nodes read-only for pointer interactions outside single-node edit mode to avoid accidental blue text selections while marquee-selecting or dragging batches
- closed context menus, image tools, and connection menus automatically when multi-selection starts

Validation completed:

- `npm run test -- src/flowCanvas/utils/nodeSelectionMode.test.ts`
- `npm run build`

### Latest Auth Page Visual Refresh

Completed in current local iteration:

- refreshed `/login` with a TapNow-style immersive product layout and glass login panel
- refreshed `/register` to reuse the same auth shell, spacing, controls, and visual language
- restored readable Chinese auth page copy and kept existing v2 auth API behavior unchanged
- added focused auth page rendering and submit tests for login/register

Validation completed:

- `npm run test -- src/auth/AuthPages.test.tsx`

Validation blocked:

- `npm run build` is currently blocked by unrelated in-progress workspace changes outside this auth task: `src/flowCanvas/panels/index.ts` exports missing canvas panel modules.
- Browser smoke for `/login` is currently blocked by unrelated Vite import analysis for `src/assets/AssetPreviewModal.tsx` resolving `./assetApi` while other local asset changes are dirty.

### Latest TapNow Workspace Phase 1 Refresh

Completed in current local iteration:

- added `docs/superpowers/plans/2026-06-12-tapnow-workspace-phase-1.md` for the authenticated workspace redesign
- refreshed the authenticated top shell into a TapNow-style dark creator nav with `??`, `????`, `???`, and `????`
- moved account/admin actions into a right-side account menu with profile, credits, account management, model settings, help, and logout entries
- changed `/workspace` into a creator home with `????????`, a prompt-style input surface, recent projects, and an all-projects jump
- refreshed workspace project controls, tabs, create card, project cards, and project copy to match the denser TapNow-style project grid
- kept existing v2 auth, project listing, project creation, and project-opening behavior unchanged

Validation completed:

- `npm run test -- src/app/WorkspaceShell.test.tsx src/workspace/WorkspacePage.test.tsx src/workspace/ProjectCard.test.tsx`
- `npm run build`

Notes:

- Phase 2 should apply the same TapNow shell language to `/assets`, `/billing`, and `/account` content pages.
