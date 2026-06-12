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

## 2026-06-12 - Canvas Dock Panels Plan

- Detailed implementation plan added for turning the left dock's empty `素材库`、`模板列表`、`评论`、`历史记录` entries into TapNow-style in-canvas drawers.
- Plan path: `docs/superpowers/plans/2026-06-12-canvas-dock-panels.md`.
- The plan is split into 8 executable tasks:
  - shared drawer shell and dock state
  - asset library drawer data/search
  - asset insert, drag, and upload entry
  - creative template backend
  - template panel and graph insertion
  - comments API and panel
  - durable history API and panel
  - integration, badges, project record, and staging validation
- Planning self-check completed: no placeholder markers found, and all four requested dock functions have concrete frontend/backend execution tasks.

## 2026-06-12 - Canvas Dock Panels Task 1-2

- Executed Task 1 and Task 2 from `docs/superpowers/plans/2026-06-12-canvas-dock-panels.md`.
- Added a shared in-canvas drawer shell and dock panel layout helper for the left dock.
- The four dock buttons now switch a unified drawer state instead of being empty placeholders.
- Opening the new drawer now syncs `leftPanelOpen`, so existing minimap and image-tool left safe area logic can react to the drawer width.
- Added the first real drawer implementation for `素材库`, reusing `useAssetLibrary()` to show:
  - search
  - folder filters
  - compact asset thumbnails
  - loading / error / empty states
- Asset insertion is still intentionally stubbed with a placeholder callback in `AiFlowCanvas`; the real click/drag/upload-to-canvas behavior remains scheduled for Task 3.
- Validation:
  - `npm run test -- src/flowCanvas/panels/canvasDockDrawer.test.ts`
  - `npm run build`

## 2026-06-12 - Canvas Dock Panels Task 3

- Executed Task 3 from `docs/superpowers/plans/2026-06-12-canvas-dock-panels.md`.
- The canvas asset drawer now supports real asset-backed image insertion:
  - clicking a drawer asset inserts a selected image node at the canvas center
  - dragging a drawer asset onto the canvas inserts the same asset-backed image node at the drop point
- Inserted asset nodes now hydrate from the real asset record plus preview/download URL resolution, so the canvas continues to use `assetId` as the source of truth instead of temporary local-only state.
- Added a compact `UploadAssetButton` variant for in-canvas drawer usage and mounted it in the asset drawer header and empty state.
- Successful upload from the asset drawer now refreshes the drawer library immediately, so newly uploaded assets can be inserted back onto the canvas without leaving the workspace.
- Also cleaned historical front-end text encoding issues in the asset drawer/upload path while keeping the current v2 asset API flow unchanged.
- Validation:
  - `npm run test -- src/assets/UploadAssetButton.test.tsx src/flowCanvas/store/flowCanvasStore.test.ts`
  - `npm run build`

## 2026-06-12 - Canvas Dock Panels Task 4

- Executed the first production-facing backend slice for `模板列表`.
- Added migration `packages/db/migrations/000021_canvas_dock_panels.sql` with:
  - `flow_templates`
  - `flow_template_usage`
  - tenant/official visibility indexes
  - row-level security policies aligned with current v2 multi-tenant rules
- Added v2 API module `flow-templates` with three endpoints:
  - `GET /api/v2/flow-templates`
  - `GET /api/v2/flow-templates/:templateId`
  - `POST /api/v2/flow-templates/:templateId/usage`
- Visibility behavior now follows the planned rule:
  - all tenants can read `official` templates
  - a tenant can read its own tenant/private templates
  - cross-tenant private templates remain hidden
- Added usage recording so Task 5 template insertion can report server-backed template adoption without inventing a second analytics path later.
- Added focused API integration test file `apps/api/test/flow-templates.test.ts` covering auth requirement, visibility scope, detail fetch, and usage insert behavior.
- Validation:
  - `npm run build --workspace @aigc-flow/db`
  - `npm run test --workspace @aigc-flow/api -- test/flow-templates.test.ts`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`
- Note:
  - the new API test is currently environment-gated the same way as the other DB integration tests; in this local session it was skipped instead of failing because the required database env was not present.

## 2026-06-12 - Canvas Dock Panels Task 5

- Executed Task 5 from `docs/superpowers/plans/2026-06-12-canvas-dock-panels.md`.
- Added front-end template client `src/services/v2FlowTemplatesApi.ts` and wired it to the new `flow-templates` backend endpoints.
- Added `CanvasTemplatePanel` so `模板列表` drawer now has:
  - search
  - category chips
  - compact template cards
  - per-template `插入` action
- Added `offsetTemplateGraphForInsert()` to safely remap template node/edge ids and place the incoming graph around the current canvas center.
- Added store action `mergeTemplateGraph()` so template insertion can append a graph into the current canvas while:
  - clearing the previous selection
  - selecting the newly inserted template nodes
  - recomputing graph index
  - marking the canvas dirty
- `AiFlowCanvas` now wires `模板列表` drawer to real insertion:
  - fetch template graph
  - offset and remap ids
  - merge into current canvas
  - record template usage against the current backend project when available
- Validation:
  - `npm run test -- src/flowCanvas/utils/templateGraph.test.ts src/flowCanvas/store/flowCanvasStore.test.ts`
  - `npm run build`

## 2026-06-12 - Canvas Dock Panels Task 6

- Executed Task 6 from `docs/superpowers/plans/2026-06-12-canvas-dock-panels.md`.
- Extended `000021_canvas_dock_panels.sql` with tenant-scoped `flow_comments` table, project/node indexes, and row-level security policies.
- Added backend comments module under `apps/api/src/modules/flow-comments` with:
  - `GET /api/v2/projects/:projectId/comments`
  - `POST /api/v2/projects/:projectId/comments`
  - `PATCH /api/v2/projects/:projectId/comments/:commentId`
- Comment backend behavior now covers:
  - project-level comments
  - node-level comments
  - optional `flowId`
  - resolve/open status updates
  - tenant/project/flow ownership checks
- Added front-end comments client `src/services/v2FlowCommentsApi.ts`.
- Added `CanvasCommentPanel` and wired the `评论` drawer in `AiFlowCanvas`:
  - open/resolved filter
  - selected-node chip
  - textarea + submit
  - comment list
  - `定位` action for node comments
  - `解决` action for open comments
- Added canvas node focus helper so a node comment can jump the viewport to the referenced node.
- Validation:
  - `npm run build --workspace @aigc-flow/api`
  - `npm run test --workspace @aigc-flow/api -- test/flow-comments.test.ts`
- Validation notes:
  - the new API integration test is currently environment-gated and was skipped in this local session because the required DB env was not present
  - root `npm run build` is currently blocked by an unrelated workspace issue outside the comments task: `Could not resolve "./ProjectCard" from "src/workspace/WorkspacePage.tsx"`

## 2026-06-12 - Canvas Dock Panels Task 7

- Executed Task 7 from `docs/superpowers/plans/2026-06-12-canvas-dock-panels.md`.
- Extended `packages/db/migrations/000021_canvas_dock_panels.sql` with tenant-scoped `flow_activity_events`, project/flow indexes, and row-level security policies.
- Added backend history module under `apps/api/src/modules/flow-history` with:
  - `GET /api/v2/projects/:projectId/history`
  - `POST /api/v2/projects/:projectId/history/snapshot`
  - `POST /api/v2/projects/:projectId/history/:versionId/restore`
- History backend behavior now covers:
  - durable project history list from `flow_activity_events`
  - snapshotting the current primary flow draft into `flow_versions`
  - restore from a saved version back into `flow_drafts`
  - snapshot/restore event recording for later drawer display
  - tenant isolation and cross-tenant restore blocking
- Added front-end history client `src/services/v2FlowHistoryApi.ts`.
- Added `CanvasHistoryPanel` and wired the `历史记录` drawer in `AiFlowCanvas`:
  - history list
  - save snapshot action
  - restore confirmation
  - immediate canvas graph replacement through store-level `restoreGraphSnapshot()`
- Added focused store regression coverage for `restoreGraphSnapshot()` so restored history now clears transient UI state and rebuilds upstream refs.
- Validation:
  - `npm run test -- src/flowCanvas/store/flowCanvasStore.test.ts`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run test --workspace @aigc-flow/api -- test/flow-history.test.ts`
- Validation notes:
  - DB integration test is environment-gated and was skipped in this local session because the required DB env was not present
  - root `npm run build` still has the existing unrelated workspace blocker: `Could not resolve "./ProjectCard" from "src/workspace/WorkspacePage.tsx"`

## 2026-06-12 - Canvas Dock Panels Task 8

- Executed Task 8 from `docs/superpowers/plans/2026-06-12-canvas-dock-panels.md`.
- Completed left dock integration polish for the four in-canvas drawers:
  - `素材库` now shows a dot badge when the tenant asset library has assets
  - `评论` now shows unresolved comment count in the dock
  - `历史记录` now shows a dot badge once snapshot history exists
  - active drawer header count now mirrors the relevant drawer metric where useful
- Added drawer/menu interlock behavior:
  - opening a drawer closes add-node and user menus
  - opening add-node or user menu closes the active drawer
  - `Escape` closes the active drawer
  - pane click closes the active drawer alongside existing context/image transient UI
- Added badge refresh hooks so comment create/resolve and history snapshot/restore update dock state immediately instead of waiting for a later reload.
- Added focused badge helper test coverage in `src/flowCanvas/panels/canvasDockDrawer.test.ts`.
- Added local draft utility coverage for explicit draft clearing helper in `src/flowCanvas/services/localFlowDraft.test.ts`; helper is available for future restore-flow hardening work but is not yet wired into Task 8 restore behavior.
- Validation:
  - `npm run test -- src/flowCanvas/panels/canvasDockDrawer.test.ts src/flowCanvas/utils/templateGraph.test.ts src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/services/localFlowDraft.test.ts`
  - `npm run test --workspace @aigc-flow/api -- test/flow-templates.test.ts test/flow-comments.test.ts test/flow-history.test.ts`
  - `npm run build --workspace @aigc-flow/db`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`
- Validation notes:
  - all focused frontend tests passed locally
  - all three API integration suites were skipped locally because DB env is still not present in this session
  - root/frontend build now passes again after the workspace-level billing page import issue was no longer blocking the build in the current worktree

## 2026-06-12 - Staging Auth 502 Deployment Follow-up

- Investigated a staging login failure that surfaced in the browser as `Request failed with status 502` after the API security-baseline work landed.
- Root cause: `apps/api/src/app.ts` and `apps/api/src/config/env.ts` now require/pass through CORS, helmet, trust-proxy, and rate-limit configuration, but `docker-compose.staging.yml` was not forwarding those variables into the `tapflow-api` or `tapflow-worker` containers.
- In production mode that left `CORS_ALLOWED_ORIGINS` empty inside the API container, which can stop API startup and cause the reverse proxy to return `502` for login and other `/api/v2/auth/*` requests.
- Fixed the deployment wiring by adding these variables to `x-tapflow-env` in `docker-compose.staging.yml`:
  - `CORS_ALLOWED_ORIGINS`
  - `SECURITY_HEADERS_ENABLED`
  - `TRUST_PROXY`
  - `API_RATE_LIMIT_MAX`
  - `API_RATE_LIMIT_WINDOW_MS`
  - `AUTH_RATE_LIMIT_MAX`
  - `AUTH_RATE_LIMIT_WINDOW_MS`
- Updated staging deployment documentation to reflect the current API runtime contract.
- Local verification after the deploy-config fix:
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-12 - Asset Library Classification and Date Grouping

- Reworked the shared asset-library view model used by both the `/assets` page and the in-canvas `素材库` drawer.
- Added media-category tabs for:
  - `图片`
  - `视频`
  - `音频`
- Changed asset presentation to group items by `createdAt` date from newest to oldest, so both surfaces now render sections such as `2026-06-12`, `2026-06-11`, and `2026-06-10`.
- Fixed a major thumbnail reliability gap in the asset preview signing flow:
  - old behavior effectively assumed `thumb` was always available
  - new behavior now falls back in order: `thumb -> preview -> original`
  - this allows older assets and upload-only assets without a `thumb` variant to still render visible media cards instead of collapsing to placeholder icons
- Added a shared grouped asset section component so the drawer and `/assets` page use the same classification, grouping, and card-density rules while keeping drawer cards visually compact.
- Updated `/assets` rendering tests and added focused regression coverage for:
  - preview request fallback selection
  - date grouping order
  - categorized asset-library empty state
- Validation:
  - `npm run test -- src/assets/assetLibraryView.test.ts src/assets/useAssetLibrary.test.tsx src/assets/AssetLibraryPage.test.tsx`
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
- refreshed the authenticated top shell into a TapNow-style dark creator nav with `主页`, `工作空间`, `素材库`, and `价格方案`
- moved account/admin actions into a right-side account menu with profile, credits, account management, model settings, help, and logout entries
- changed `/workspace` into a creator home with `今天要做点什么？`, a prompt-style input surface, recent projects, and an all-projects jump
- refreshed workspace project controls, tabs, create card, project cards, and project copy to match the denser TapNow-style project grid
- kept existing v2 auth, project listing, project creation, and project-opening behavior unchanged

Validation completed:

- `npm run test -- src/app/WorkspaceShell.test.tsx src/workspace/WorkspacePage.test.tsx src/workspace/ProjectCard.test.tsx`
- `npm run build`

### Latest Project and Asset Management Menus

Completed in current local iteration:

- added shared `EntityActionMenu` primitives plus a `WorkspaceActionMenu` wrapper for TapNow-style entity management menus
- wired project grid cards to a three-dot management menu with open, rename, disabled future actions, and delete
- wired project list mode to an operation column with the same project management menu
- connected project rename to `updateWorkspaceProject` and project delete to `DELETE /projects/:id`, refreshing the workspace list after successful actions
- wired asset cards to a three-dot management menu with preview, rename, favorite/unfavorite, move to folder, download original, and delete
- connected asset rename, favorite, download, delete, and move-to-folder to the existing asset and folder APIs, refreshing the asset library after mutations
- tightened menu state handling so menu actions that open dialogs or run immediate operations close the menu cleanly, while the folder move submenu remains available until a folder is selected
- added regression coverage for project rename/delete and asset rename/favorite/download/move/delete menu flows

Validation completed:

- `npm run test -- src\workspace\WorkspacePage.test.tsx src\assets\AssetLibraryPage.test.tsx`

### Latest Workspace Cover and Asset Library Performance Fix

Completed in current local iteration:

- changed workspace project cover loading from per-card signed URL requests to a deduplicated batch signing pass in `useWorkspaceProjects`
- kept project cards render-only for cover URLs and added lazy/async image loading so the project grid does not create request storms
- added an in-memory asset library snapshot cache so reopening `/assets` can show the last loaded page immediately while fresh data reloads
- changed asset library media tab counts to use server totals instead of the current 60-item page length
- made image/video/audio count refresh run in the background after the first asset page renders, avoiding count queries blocking the library view

Validation completed:

- `npm run test -- src/workspace/useWorkspaceProjects.test.tsx src/workspace/ProjectCard.test.tsx src/assets/AssetLibraryPage.test.tsx src/assets/useAssetLibrary.test.tsx`
- `npm run test -- src/workspace/HomePage.test.tsx src/workspace/WorkspacePage.test.tsx src/workspace/useWorkspaceProjects.test.tsx src/workspace/ProjectCard.test.tsx src/assets/AssetLibraryPage.test.tsx src/assets/useAssetLibrary.test.tsx src/assets/assetLibraryView.test.ts`
- `npm run build`

### 2026-06-12 - Canvas Asset Drawer UI Refresh

- Restyled the left in-canvas `素材库` drawer toward the TapNow reference while keeping the existing grouped asset data flow unchanged.
- Simplified the drawer hierarchy:
  - removed the extra folder chip row from the main drawer surface
  - kept media tabs as the primary filter control
  - retained date-grouped sections as the main browsing structure
- Changed compact asset rendering from metadata-heavy cards to thumbnail-first tiles:
  - compact drawer items now render as pure image/video thumbnails
  - visible filename / kind / size text is removed from the drawer
  - accessibility is preserved via button `aria-label`
- Refined drawer density to better match the reference:
  - larger search field
  - larger compact upload button
  - stronger date heading hierarchy
  - more restrained card chrome and spacing
  - slightly cleaner drawer shell padding and header density
- Added focused regression coverage for the drawer presentation so future changes do not accidentally bring back verbose card metadata or the folder chip row.

Validation completed:

- `npm run test -- src/flowCanvas/panels/CanvasAssetPanel.test.tsx src/assets/AssetLibraryPage.test.tsx src/assets/assetLibraryView.test.ts src/assets/useAssetLibrary.test.tsx`
- `npm run build`

### 2026-06-12 - Asset Aspect Ratio Preservation Fix

- Fixed the asset-library-to-canvas aspect ratio regression where portrait uploads could appear as square `1:1` nodes after insertion.
- Frontend upload flow now reads the original image's natural `width` and `height` before upload and sends those dimensions through both:
  - `/api/v2/assets/presigned-upload`
  - `/api/v2/assets/:assetId/complete-upload`
- Canvas asset insertion now has a compatibility fallback for historical assets:
  - after inserting an asset-backed image node from the drawer, the canvas reads the preview image's real dimensions
  - if stored asset dimensions are missing or materially inconsistent with the preview, the node is rehydrated to the correct aspect ratio on canvas
- Backend asset upload-bytes flow now also extracts original image dimensions from binary uploads with `sharp().metadata()` and backfills `assets.width` / `assets.height` when they are still missing, so the system is more resilient even if a frontend path misses dimension metadata in the future
- Result:
  - new uploaded materials keep the correct portrait / landscape ratio on canvas
  - old materials with missing or wrong stored dimensions can still be inserted with corrected on-canvas proportions

Validation completed:

- `npm run test -- src/assets/assetApi.test.ts src/flowCanvas/utils/assetNodeData.test.ts src/flowCanvas/store/flowCanvasStore.test.ts`
- `npm run build`
- `npm run build --workspace @aigc-flow/api`

### 2026-06-12 - Asset Modal Insert Route Aspect Ratio Follow-up

- Fixed the remaining portrait asset insertion path that still rendered some asset-library images as square `1:1` nodes on canvas.
- Root cause:
  - the earlier aspect-ratio recovery work covered the in-canvas asset drawer insertion path
  - inserting from the `/assets` preview modal used the separate `insertAssetId` route flow in `FlowProjectPage`, which was still building nodes only from stored asset metadata
- Changes made:
  - extracted the shared natural-size reconciliation logic into `src/flowCanvas/utils/assetNodeData.ts`
  - reused that logic in both:
    - `src/flowCanvas/canvas/AiFlowCanvas.tsx`
    - `src/flowCanvas/FlowProjectPage.tsx`
  - added a regression test that locks the `?insertAssetId=` portrait-asset case so preview-modal insertion now rehydrates bad historical metadata back to the correct `9:16`-style canvas size

Validation completed:

- `npm run test -- src/flowCanvas/FlowProjectPage.test.tsx src/flowCanvas/utils/assetNodeData.test.ts`
- `npm run build`

### Latest TapNow Billing Pixel Alignment Pass

Completed in current local iteration:

- pushed `/billing` closer to the TapNow reference pricing page with an open dark dotted canvas, oversized `选择你的套餐` headline, larger spacing, and a yearly billing segmented control
- enlarged Basic, Pro, and Ultimate pricing cards with uppercase plan labels, a `最受欢迎` Pro pill, card CTAs, and plan-specific monthly credit benefits
- kept the existing server-backed billing summary, usage, ledger, redeem, and recharge behavior unchanged below the pricing-first surface
- extended the focused billing page rendering test to lock the yearly switch, Pro highlight, card CTAs, and visible credit benefit copy

Validation completed:

- `npm run test -- src/billing/BillingCenterPage.test.tsx`

### Latest TapNow Workspace Pixel Alignment Pass 2

Completed in current local iteration:

- refined the `/workspace` home surface toward the TapNow reference with a more centered creator prompt, tighter first-screen spacing, and compact quick action chips for `AI 视频`, `图像生成`, `智能抠图`, and `批量工作流`
- refreshed the project management section from generic `项目` copy to `我的空间` with clearer supporting text and a lighter count pill
- reduced the visual weight of project tabs, search, sort, view toggle, refresh, and create controls so the project grid reads closer to TapNow's dense product UI
- tightened create/project card dimensions, thumbnail ratios, rounded corners, metadata sizing, and hover affordances while keeping project creation/opening behavior unchanged
- extended the workspace page test coverage for the new quick actions and project section copy

Validation completed:

- `npm run test -- src/workspace/WorkspacePage.test.tsx`

### Latest Home / Workspace Split and Project Cover Pass

Completed in current local iteration:

- split the TapNow-style creator home into a dedicated `/home` route and kept `/workspace` as a standalone project management page
- updated the authenticated shell so `主页` navigates to `/home` and `工作空间` navigates to `/workspace` without hash-based scrolling behavior
- changed root authenticated redirects to land on `/home`
- aligned the workspace page with the TapNow grid/list references: grid remains card-based, list mode now uses a table-like preview/name/type/created/updated layout
- added server-side project cover inference from the latest flow draft: generated image result assets take priority, uploaded canvas image assets are next, and projects with no durable image asset continue to fall back to the frontend gradient cover
- added focused tests for the split home/workspace behavior and draft-cover inference rules

Validation completed:

- `npm run test -- src/workspace/HomePage.test.tsx src/workspace/WorkspacePage.test.tsx src/workspace/ProjectCard.test.tsx src/app/WorkspaceShell.test.tsx apps/api/test/project-cover-inference.test.ts`

Notes:

- Phase 2 should apply the same TapNow shell language to `/assets`, `/billing`, and `/account` content pages.

### Latest TapNow Secondary Pages Phase 2 Refresh

Completed in current local iteration:

- refreshed `/assets` into a cleaner TapNow-style asset library with left-side category navigation, product copy, compact tool buttons, search, and a richer empty state for image/video/audio uploads
- refreshed `/billing` into a price-plan-first page with Basic, Pro, and Ultimate cards while keeping existing server-backed balance, usage, ledger, redeem, and recharge flows unchanged
- refreshed `/account` into a product settings-style page with readable identity, workspace, and model connection sections
- kept the Phase 2 scope presentation-only: no backend API, auth, billing ledger, or asset storage behavior was changed
- added focused rendering tests for the three refreshed pages

Validation completed:

- `npm run test -- src/assets/AssetLibraryPage.test.tsx src/billing/BillingCenterPage.test.tsx src/account/AccountPage.test.tsx`

### Latest TapNow Canvas Entry Phase 3 Refresh

Completed in current local iteration:

- added `docs/superpowers/plans/2026-06-12-tapnow-canvas-entry-phase-3.md` for the project canvas entry refresh
- refreshed the empty project canvas start surface with `今天想创作什么？`, concise guidance, and compact quick-start actions
- refreshed project canvas loading/error wording and retry action copy while keeping remote project loading and autosave behavior unchanged
- added focused tests for the canvas empty state, project loading/error/save status copy, and left dock add-node menu copy
- kept the Phase 3 scope presentation-only: no dock drawer, backend, billing, asset storage, workflow execution, or autosave semantics were changed

Validation completed:

- `npm run test -- src/flowCanvas/FlowCanvasPage.test.tsx src/flowCanvas/FlowProjectPage.test.tsx src/flowCanvas/canvas/FlowLeftAddPanel.test.tsx`

### Latest TapNow Workspace Pixel Alignment Pass

Completed in current local iteration:

- fixed the top `工作空间` navigation so clicking it on `/workspace` updates `#projects` and dispatches a reveal event that the workspace page can use to scroll to the project section
- separated `主页` and `工作空间` active states so `#projects` no longer visually behaves like the same nav target
- removed the oversized framed hero container from the workspace home and moved the first screen closer to TapNow's full-page dotted background layout
- narrowed the home content, increased the title/icon scale, tightened the prompt bar, and resized recent project cards toward the TapNow reference proportions
- restored readable Chinese copy in the workspace home loading/prompt/recent-project surfaces touched by this pass

Validation completed:

- `npm run test -- src/app/WorkspaceShell.test.tsx src/workspace/WorkspacePage.test.tsx src/workspace/ProjectCard.test.tsx`
- `npm run build`
