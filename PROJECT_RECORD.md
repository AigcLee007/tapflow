# Project Record

Last updated: 2026-06-18
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

As of 2026-06-13:

- TapNow-style visual alignment work has been iterated several rounds on canvas layout, add-node menus, user menus, and node title density
- project-scoped image workbench V1 is implemented on top of the same v2 flow draft/runtime path: desktop now has a left-parameter plus right-batch-feed workbench surface, mobile project entry defaults to workbench mode, workbench generations create normal image nodes with shared autosave plus target-node workflow execution, and completed assets continue to land in the same canvas/assets pipeline
- media asset preview optimization is implemented
- historical asset variant backfill script is implemented and validated on staging
- staging asset backfill has been executed successfully
- `/projects` and `/assets` loading experience improved and validated
- production/staging Docker image base Node version upgraded from 18 to 22
- staging runtime confirmed on Node `v22.22.3` for both API and worker
- local image upload smoothness root cause identified: upload entry points still wait for image decode/measurement before first canvas paint
- upload smooth preview execution plan added at `docs/superpowers/plans/2026-06-11-upload-smooth-preview-pipeline.md`
- image generation target-node input propagation fixed: upstream text nodes, image/upload asset nodes, and `batchCount` now reach the worker/provider request instead of remaining visual-only canvas state
- image crop/resize/split/annotation/generated-result derived nodes now render immediately with a local preview while cloud asset persistence continues in the background
- model-backed image node tools now use the v2 target-node workflow path, so logged-in v2 users no longer hit the legacy `auth-session-v1` billing login error from repaint/erase/outpaint/relight/multi-angle/enhance/remove-background actions
- v2 image edit result nodes now persist the resolved preview URL back into canvas node data, show a model/route run label while generating, and forward source asset URLs into Visionary/Gemini image adapters so edit models receive the actual input image
- target-node image edit tools now preserve the selected runtime `routeKey` from the canvas model line, avoiding wrong-line fallback that could yield completed white result images even when the workflow itself succeeded
- target-node image edit launches now wait for any in-flight remote draft save to finish and then save the latest canvas graph before creating the workflow run, so newly created edit target nodes are present in server-side `flow_drafts` before API/worker execution begins
- image edit tools now ignore stale generic `image.default` route keys on uploaded/asset-backed source nodes when a model-scoped runtime route is available, preventing edits from silently running through the mock/default image route instead of the configured provider relay
- target-node workflow launch now marks missing backend `node_run` snapshots as a visible node failure with diagnostic launch status instead of leaving a blank white result card
- target-node image edit launch no longer stalls at `workflowLaunchStatus: saving_draft` when a manual run-save barrier overlaps an existing autosave; `saveNow()` now performs a foreground latest-graph flush before allowing workflow run creation to continue
- same-origin asset bytes responses now normalize `content-length` from the actual response body and fall back from empty preview variants to original image bytes, addressing completed image-edit runs that rendered as 0-byte white previews
- image edit worker requests now recover route keys from nested edit metadata when the top-level node route key is missing, preventing model-backed edits from falling back to the mock `image.default` route
- canvas image previews now use browser-loadable signed preview URLs again, with automatic recovery from older saved authenticated `/bytes` URLs
- text target-node runs now correctly complete the node UI after a successful GPT-5.5 response, and worker-side text prompt assembly now honors `generationPrompt` for text nodes without upstream text input, fixing empty-prompt replies like `I got an empty prompt ([])`
- canvas top-left project menu now renders through a body-level fixed portal with TapNow-style width and anchored positioning, preventing overlap with the left dock and keeping project-menu dismissal behavior stable when other toolbar menus open
- canvas model pickers now align more closely with add-node menu density: image/text model menu labels use the shared compact menu rhythm and the image model picker/dropup width has been narrowed to better match the prompt-bar target width
- GPT-image-2 multi-image generation now follows the same one-image-per-request batching strategy already used by GPT-image-2 reference edits, preventing upstream `The provider rejected the request payload` failures when creators set image count above `1`
- MouxiHub GPT-Image-2 `绾胯矾涓?绾胯矾鍥沗 upstream failure root cause was confirmed from production `ai_call_logs`: we were sending pixel `size` together with already size-suffixed upstream models, which made MouxiHub internally resolve invalid model names like `gpt-image-2-4k-4k`; runtime fallback now forces these two routes to use provider-side base models (`gpt-image-2` / `gpt-image-2-vip`) while still forwarding the existing GPT-image-2 pixel-size payload
- Follow-up root cause for MouxiHub GPT-Image-2 `绾胯矾鍥沗 was also fixed: legacy `ai_routes.upstream_model` values were still being injected into `requestConfig.model` and could override the new line-four runtime fallback, so provider-side GPT-Image-2 base model routing now prefers dedicated `providerBaseModel`/route defaults over stale normalized route config
- desktop `/workbench` has now been restructured into a fixed three-pane docked workstation: the desktop shell reads as `3:5:2`, the left parameter dock keeps the existing composer UI with a pinned footer action area, the center pane is split into current-task stage plus recent-task window capped to the newest 8 operational tasks, and the right dock now shows completed-only history with no active generations mixed into that rail
- `/assets` drag multi-select now uses a floating contextual toolbar at the user's selection endpoint instead of a sticky top bulk bar, with cancel, select all, favorite, download original, and delete actions available next to the selection
- `/assets` drag multi-select has been further reworked against the smoother `D:\gpt-iamge-2` task-grid interaction pattern: selection now uses page coordinates, drag thresholding, hit slop, body-level text-selection suppression, auto-scroll near viewport edges, and a fixed screen-centered floating toolbar instead of edge-sensitive selection-bound positioning

## 2026-06-18 - Workbench Three-Pane Docked Desktop Layout

- Rebuilt the desktop workbench layout into a deterministic docked shell instead of the earlier loosely balanced fullscreen studio layout.
- Locked the desktop pane proportions to the approved `3:5:2` visual structure:
  - left dock = parameter composer
  - center pane = current task stage + recent tasks
  - right dock = completed-only history
- Added explicit desktop task partition helpers under `src/workbench/workbenchDesktopLayout.ts` so the page now derives:
  - primary stage task
  - center recent operational tasks
  - right completed-only history
- The center pane now stays focused on the current task and the latest operational window, capped to at most 8 relevant tasks.
- The right dock now excludes queued/running tasks and only shows completed generations.
- The left workbench composer keeps its existing control UI, but its summary card and generate button now live in a separate pinned footer area so desktop users do not need to scroll down the full parameter column just to trigger generation.
- Added focused regression coverage for:
  - `src/workbench/workbenchDesktopLayout.test.ts`
  - `src/workbench/WorkbenchPage.test.tsx`
- Validation:
  - `npx vitest run src/workbench/workbenchDesktopLayout.test.ts src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

## 2026-06-18 - Workbench Two-Column Results Rail Desktop Redesign

- Replaced the just-landed desktop three-pane workbench shell with the newly approved two-column workstation layout for `/workbench`.
- Desktop now uses a fixed `3:7` shell:
  - left column = existing parameter composer dock
  - right column = unified results workspace
- Removed the dedicated desktop center current-task pane so desktop width is no longer split across:
  - stage hero
  - recent-task list
  - narrow history dock
- Kept the left parameter area visually/functionally aligned with the current workbench composer implementation, including its pinned footer action area.
- Rebuilt the right side as a single internal-scrolling workspace with:
  - a compact active status band for `pending / queued / running / waiting_provider / succeeded-without-results`
  - a single-column horizontal completed-results rail for finished generations only
- Simplified the desktop derivation helpers in `src/workbench/workbenchDesktopLayout.ts` so desktop rendering now partitions history into:
  - `activeGenerations`
  - `completedGenerations`
- Added regression coverage to lock the new desktop shell and horizontal completed-card layout in place:
  - `src/workbench/workbenchDesktopLayout.test.ts`
  - `src/workbench/WorkbenchPage.test.tsx`
- Validation:
  - `npx vitest run src/workbench/workbenchDesktopLayout.test.ts src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

## 2026-06-18 - Asset Library Floating Selection Toolbar

- Replaced the `/assets` drag-selection sticky top bulk bar with a fixed floating toolbar that appears near the user's selection endpoint, matching the requested contextual action behavior.
- Added the requested toolbar actions in order:
  - cancel selection
  - select all visible assets
  - favorite selected assets
  - download original files for selected assets
  - delete selected assets with confirmation
- Stabilized drag selection from asset thumbnails by preventing the same pointer-down from also bubbling to the outer selection surface after the card starts marquee selection.
- Kept selected-asset cleanup tied to asset-list changes and identity changes so stale selections/toolbars disappear when the list changes.
- Extended asset-library regression coverage for the floating toolbar position, complete action set, select-all behavior, bulk favorite, bulk download, and existing bulk delete flow.
- Validation:
  - `npm test -- src/assets/AssetLibraryPage.test.tsx`
  - `npm run build`

## 2026-06-18 - Asset Library Overlay Position Polish

- Anchored the `/assets` bulk-selection toolbar to the currently visible asset library viewport instead of the whole browser viewport, so it stays inside the current library window while scrolling.
- Restyled the bulk toolbar from a white pill to a dark translucent AI Flow control surface with project-consistent borders, shadows, dividers, and hover states.
- Anchored the asset preview overlay to the currently visible asset library viewport and expanded the preview dialog to fill that window, giving double-click image preview a much larger image stage.
- Added focused regressions for panel-relative toolbar positioning, dark toolbar styling, and viewport-filling asset preview overlay layout.
- validation:
  - `npm test -- src/assets/AssetLibraryPage.test.tsx src/assets/AssetPreviewModal.test.tsx`
  - `npm run build`

## 2026-06-18 - Asset Library Drag Selection Deep Optimization

- Compared the `/assets` drag-select interaction against `D:\gpt-iamge-2\src\components\TaskGrid.tsx` and moved the current implementation toward the same smoother interaction model.
- Reworked marquee selection to use page-space coordinates so scrolling during a drag no longer shifts the selection math.
- Added drag thresholding so tiny pointer movement on an asset tile does not create a selection or suppress normal card behavior.
- Added selection hit slop so users do not need to drag perfectly across the interior of every tile to select it.
- Reduced drag-time re-render churn by only notifying the asset library when the selected id set actually changes.
- Added body-level `asset-drag-selecting` styling to suppress text selection during marquee drag.
- Added edge auto-scroll while dragging near the top/bottom of the viewport.
- Changed the floating selection toolbar to stay fixed around the screen center/bottom like the reference app's selected-record action bar, instead of following the raw mouse-up point or selected asset bounds.
- Marked asset action menus as non-selection targets so clicking tile management controls does not accidentally start marquee selection.
- Extended regression coverage for selected-bounds toolbar positioning and tiny pointer movement behavior.
- Validation:
  - `npm test -- src/assets/AssetLibraryPage.test.tsx`
  - `npm run build`

## 2026-06-14 - MouxiHub Nano Banana Pro Official T3 Route

- Added a built-in AI Gateway plugin package for `Nano Banana Pro` route `绾胯矾浜岋紙瀹樻柟T3锛塦.
- The new route uses MouxiHub OpenAI-compatible async image APIs:
  - text-to-image: `/v1/images/generations?async=true`
  - image edit: `/v1/images/edits?async=true`
  - polling: `/v1/images/tasks/{task_id}`
- Runtime requests now support route-configured size-based upstream model selection for OpenAI-compatible image routes:
  - `1K` -> `gemini-3.1-flash-image-preview`
  - `2K` -> `gemini-3.1-flash-image-preview-2k`
  - `4K` -> `gemini-3.1-flash-image-preview-4k`
- Workflow reserve pricing now supports `model_pricing.metadata.sizeTiers`, so the T3 route can reserve `6 / 8 / 12` credits for `1K / 2K / 4K`.
- Creator-facing fallback labels now include `Nano Banana Pro 绾胯矾浜岋紙瀹樻柟T3锛塦 so route keys and provider details are not shown while route data loads.
- Validation:
  - `npm run test --workspace @aigc-flow/api -- ai-plugins.service.test.ts`
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts plugin-registry.test.ts`
  - `npm run test --workspace @aigc-flow/api -- workflow-pricing-resolver.test.ts ai-plugins.test.ts`
  - `npx vitest run src/flowCanvas/utils/modelCatalogOptions.test.ts`
  - `npm run build`
  - `npm run build --workspace @aigc-flow/redis`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build --workspace @aigc-flow/worker`
- Follow-up fix: plugin initialization now builds an aligned `ai_routes` insert statement so `base_url_override`, `request_config`, `rate_limit`, `status`, `plugin_install_id`, and `request_path` are written to the intended columns. This addresses Template Library installs that could fail server-side and leave the UI showing `鏈畨瑁卄.

- Follow-up fix: template-created provider connections now keep `adapter_kind` aligned to the provider adapter (`openai-compatible`) while `api_mode` remains the route execution mode (`async`). Canvas model-route options now keep official Nano Banana Pro route ordering so line one remains the 24-credit PixelleLabs route and line two official T3 remains the MouxiHub route.

- Follow-up fix: OpenAI-compatible async polling now recognizes MouxiHub task states such as `SUBMITTED`, `QUEUED`, `PROCESSING`, `COMPLETED`, and top-level task detail responses. This keeps successful official T3 async tasks from failing early with `The provider poll response did not include a recognized task status`.
- Follow-up fix: MouxiHub async polling now also infers task state when the provider omits `status`: parsed image outputs are treated as success, while task/progress-only responses remain pending/running instead of failing early.
- Validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts -t "status is missing"`
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts -t "MouxiHub"`
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts plugin-registry.test.ts`
  - `npm run build --workspace @aigc-flow/ai-gateway-core`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-14 - Brand Chrome and Transition System Tasks 1-4

- Added a shared creator-facing brand UI layer under `src/app/brand`:
  - `BrandMark` for consistent logo rendering in dark chrome
  - `BrandTransition` for branded animated loading states
- Upgraded auth loading from plain centered text to a branded full-screen transition so the first workspace entry feels intentional instead of placeholder-like.
- Upgraded project canvas loading from a text spinner card to the same branded transition, with clearer supporting copy for draft/node recovery.
- Unified touched project loading, save-status, retry, and asset-insert strings to readable Chinese in the updated surfaces.
- Replaced the canvas top-left inline logo image with the shared `BrandMark`, increasing logo clarity, contrast, and title hierarchy in the canvas chrome.
- Added focused regression coverage for:
  - `src/app/brand/BrandMark.test.tsx`
  - `src/app/brand/BrandTransition.test.tsx`
  - `src/auth/AuthGate.test.tsx`
  - `src/flowCanvas/FlowProjectPage.test.tsx`
  - `src/flowCanvas/canvas/FlowTopToolbar.test.tsx`
- Validation:
  - `npm test -- src/app/brand/BrandMark.test.tsx src/app/brand/BrandTransition.test.tsx src/auth/AuthGate.test.tsx src/flowCanvas/FlowProjectPage.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx`
  - `npm run build`

## 2026-06-14 - Brand Chrome and Transition System Tasks 5-7

- Replaced `/workspace` project-list loading with an inline branded transition so the project surface keeps its layout while data refreshes.
- Added a lightweight route fade shell in `AppRouter` for non-canvas page switches to reduce plain text/blank-feeling transitions.
- Changed `/assets` loading to contextual skeleton tiles instead of a static text wait state.
- Changed the canvas asset drawer loading experience to compact skeleton thumbnails so reopening the drawer keeps canvas context visible.
- Normalized touched template/history/asset/workspace strings to readable Chinese in the updated loading and empty-state surfaces.
- Added reduced-motion-safe skeleton animation support in `src/index.css`.
- Validation:
  - `npm test -- src/app/brand/BrandMark.test.tsx src/app/brand/BrandTransition.test.tsx src/auth/AuthGate.test.tsx src/flowCanvas/FlowProjectPage.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/workspace/WorkspacePage.test.tsx src/assets/AssetLibraryPage.test.tsx src/flowCanvas/panels/CanvasAssetPanel.test.tsx`
  - `npm run build`

## 2026-06-14 - Canvas Logo Menu and Home Logo Routing

- Changed the canvas top-left logo interaction so `/projects/:projectId` now opens a TapNow-style dark project menu instead of behaving like a static mark.
- Kept the canvas menu focused on project actions only:
  - `杩斿洖宸ヤ綔绌洪棿`
  - `閲嶅懡鍚嶉」鐩甡
  - `鏂板缓椤圭洰`
  - `鍒犻櫎椤圭洰`
- Wired the canvas menu actions to real product behavior:
  - return to `/workspace`
  - focus the title input for rename and persist the renamed project on blur
  - create a new workspace project and enter its canvas
  - delete the current project and return to `/workspace`
- Locked the non-canvas behavior so the shared header logo continues to navigate directly to `/home` without opening any project menu.
- Normalized touched toolbar and test copy to readable Chinese while keeping the change scoped to the current chrome interaction work.
- Validation:
  - `npm test -- src/app/WorkspaceShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx`
  - `npm run build`

## 2026-06-14 - Global Menu and Auth Layout Unification Task 6

- Continued the approved menu/UI unification plan on admin and model-management surfaces, keeping the shared dark menu language consistent with the canvas and workspace updates finished earlier in the day.
- Extended shared menu primitives in `src/components/menu/MenuSelect.tsx` so the same control can cover dense settings forms safely:
  - added compact sizing
  - added full-width layout support
  - added disabled-state support
- Replaced visible native dropdowns on the main provider/model admin surfaces with the shared menu trigger UI:
  - `src/account/ProviderSettingsPage.tsx`
  - `src/account/ai-settings/AiSettingsPage.tsx`
- Provider Connections page now uses shared menu selects for:
  - provider filter
  - model family filter
  - create credential provider
  - create connection provider
  - create connection credential
  - edit connection credential
  - edit connection status
- Model Center route management now uses shared menu selects for:
  - create route provider
  - create route connection
  - create route model
  - create route status
  - edit route connection
  - edit route status
- Added and aligned focused regression coverage for the shared menu select behavior and the two upgraded admin pages.
- Validation:
  - `npm test -- src/components/menu/MenuSelect.test.tsx`
  - `npm test -- src/account/ProviderSettingsPage.test.tsx src/account/ai-settings/AiSettingsPage.test.tsx`
  - `npm run build`

## 2026-06-14 - Global Menu and Auth Layout Unification Task 7

- Confirmed the login/register shell is now using the reduced first-screen layout scale from the approved unification plan instead of the earlier oversized composition.
- Locked the auth layout expectations in `src/auth/AuthPages.test.tsx`, including:
  - reduced outer shell width
  - tightened desktop grid split
  - smaller login heading scale
- Re-ran the cross-surface unification validation suite so the shared menu primitives, shell logo behavior, canvas menu behavior, workspace dropdown replacements, and auth layout all validate together.
- Validation:
  - `npm test -- src/auth/AuthPages.test.tsx`
  - `npm test -- src/components/menu/useDismissibleLayer.test.tsx src/components/menu/MenuSelect.test.tsx src/app/WorkspaceShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/workspace/WorkspacePage.test.tsx src/auth/AuthPages.test.tsx`
  - `npm run build`

## 2026-06-14 - Post-Plan Native Select Cleanup

- Continued the approved menu unification work beyond Tasks 1-7 by removing the remaining visible native `<select>` controls from the current frontend source tree.
- Replaced project selection in the asset preview modal with the shared compact `MenuSelect`.
- Replaced image-edit mask mode selectors in:
  - `src/flowCanvas/nodes/ImageOutpaintOverlay.tsx`
  - `src/flowCanvas/nodes/ImageRepaintOverlay.tsx`
- Replaced remaining node-level native selects inside `src/flowCanvas/nodes/FlowNodes.tsx`, including:
  - shared inline parameter selects
  - dynamic image parameter select fields
  - video node model selection
- Updated focused asset preview regression coverage to assert the new custom menu trigger instead of native input value lookup.
- Added focused image-edit overlay coverage so repaint and outpaint mask mode controls stay on the shared custom menu path.
- Validation:
  - `npm test -- src/assets/AssetPreviewModal.test.tsx src/components/menu/MenuSelect.test.tsx`
  - `npm test -- src/flowCanvas/nodes/ImageEditOverlayMenuSelect.test.tsx`
  - `rg -n '<select' src`
  - `npm run build`

## 2026-06-14 - Canvas Menu Density and Layering Follow-up

- Fixed the canvas logo project menu placement after staging screenshots showed it could open under the left floating dock and appear clipped.
- Moved the canvas project menu to a fixed, dock-safe position so it opens to the right of the left rail instead of behind it.
- Re-aligned shared menu typography, row height, radius, and spacing to the left add-node menu reference:
  - 38px menu row height
  - 12px primary labels
  - 9px secondary labels
  - compact 7px item gaps and 10px row radius
- Raised image model/settings/more menus above the floating image toolbar so menus no longer render behind the toolbar.
- Added focused style regression coverage for the project menu safe placement and image-menu z-index/density tokens.
- Validation:
  - `npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/nodes/imageMenuStyles.test.ts src/components/menu/MenuSelect.test.tsx`
  - `rg -n "min-h-\\[54px\\]|h-16|text-\\[15px\\]|rounded-\\[26px\\]|z-\\[260\\]" src/components/menu src/flowCanvas/canvas src/flowCanvas/nodes`
  - `npm run build`

## 2026-06-14 - Menu UI Rules Added to Agent Instructions

- Added a project-wide menu/dropdown UI rule section to `AGENTS.md`.
- Documented the shared menu token entry points and the TapNow-style density baseline:
  - 38px menu rows
  - 12px primary labels
  - 9px secondary labels
  - 7px row gaps
  - 30px icon boxes
- Documented rules to avoid one-off native selects, oversized menu rows, and custom menu typography outside shared tokens.
- Validation:
  - `rg -n "Menu and Dropdown UI Rules|menu row height: 38px|primary label font size: 12px|Do not use native <select>" AGENTS.md`

## 2026-06-14 - Canvas Project Menu and Delete Confirmation Refresh

## 2026-06-16 - Canvas Agent Phase 1 Implementation

- Implemented the first usable Canvas Agent foundation under `src/flowCanvas/agent/*`.
- Added a typed Agent operation protocol covering:
  - add node
  - update node data
  - connect nodes
  - delete nodes / edges
  - select nodes
  - set viewport
  - approved `run_node`
- Added sanitized canvas snapshot building so Agent planning only receives creator-safe canvas evidence and does not expose provider internals.
- Added policy validation and op summaries so approval-gated writes and credit-consuming actions are separated from simple safe writes.
- Added deterministic local planning for:
  - basic text-to-image flow creation
  - selected-image to video flow creation
- Added creator-facing Agent UI:
  - bottom-right Agent entry button
  - right-side Agent panel
  - prompt composer
  - plan approval card
  - task/error status card
- Added confirmed canvas execution flow:
  - approved plans write into the existing Zustand canvas store
  - `run_node` continues to use the existing `runBackendWorkflow({ runMode: 'target_node' })` chain
  - create-only approval path now strips `run_node` ops and only writes nodes/edges
- Added server-backed Agent persistence and planning scaffolding:
  - `agent_sessions`
  - `agent_messages`
  - `agent_turns`
  - `agent_tool_calls`
  - tenant-scoped RLS migration `000024_agent_sessions.sql`
- Added authenticated API routes:
  - `POST /api/v2/agent/sessions`
  - `GET /api/v2/agent/sessions/:sessionId`
  - `POST /api/v2/agent/sessions/:sessionId/turns`
  - `POST /api/v2/agent/sessions/:sessionId/turns/stream`
- Added guarded planner env support:
  - `AGENT_PLANNER_ENABLED`
  - `AGENT_TEXT_ROUTE_KEY`
- Current behavior keeps deterministic planning as the safe default. Text-runtime planning is gated and rejects unsafe output containing internal provider fields.
- Validation:
  - `npm test -- src/flowCanvas/agent/canvasAgentTypes.test.ts src/flowCanvas/agent/canvasAgentSnapshot.test.ts src/flowCanvas/agent/canvasAgentPolicy.test.ts src/flowCanvas/agent/canvasAgentOps.test.ts src/flowCanvas/agent/offlineCanvasAgentPlanner.test.ts src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/canvasAgentApi.test.ts src/flowCanvas/agent/CanvasAgentPlanCard.test.tsx`
  - `npm test -- src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/agent/CanvasAgentIntegration.test.tsx`
- Validation note:
  - database-backed `packages/db` and `apps/api` Agent tests were skipped locally because the current environment did not provide a runnable `DATABASE_URL` test database, matching the repo’s existing conditional DB-test behavior.

- Refined the canvas top-left project menu toward the approved minimal TapNow-style direction:
  - narrowed the menu width from the earlier wide flyout
  - tightened non-primary rows to a 60px rhythm
  - removed mixed create/delete row icons so the menu reads as a cleaner text-led action list
- Replaced the canvas project delete `window.confirm(...)` flow with a custom dark action-sheet-style confirmation surface:
  - dark translucent panel
  - compact destructive copy
  - explicit `鍒犻櫎` / `鍙栨秷` actions
  - backdrop-dismiss and `Escape` dismissal support
  - inline error retention on delete failure
- Normalized touched canvas toolbar copy back to readable Chinese for the refreshed project menu and the surrounding toolbar strings touched during the change.
- Added focused regression coverage for:
  - slimmer project menu width and row density
  - custom delete confirmation open/cancel/confirm behavior
- Validation:
  - `npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx`
  - `npm run build`

## 2026-06-14 - Cinematic Brand Transition Animation

- Upgraded the shared brand loading animation from a dashed highlight into a cinematic infinity-path motion system.
- Enlarged the transition logo mark to roughly 2x the previous loading scale so fullscreen and inline loading states read as a real brand transition.
- Rebuilt the animated infinity layer around one canonical SVG path and added:
  - full-path aura glow
  - moving trail stroke
  - exact-path light particle
  - delayed tail particles
  - restrained center crossing pulse
- Kept the existing `BrandTransition` API intact so workspace, canvas, auth, and inline loaders inherit the upgraded animation without route-level behavior changes.
- Added reduced-motion fallback that removes particle travel and looped trail motion while preserving a calm premium branded state.
- Validation:
  - `npm test -- src/app/brand/BrandMark.test.tsx src/app/brand/BrandTransition.test.tsx`
  - `npm run build`
  - `git diff --check`

## 2026-06-14 - Media Generation Stability and Speed Optimization Phases 0-4

- Implemented the approved first four phases of the media generation optimization plan while keeping the existing OSS/S3 asset-first persistence path.
- Added worker-side timing metadata for provider-output download, original object upload, asset DB insert, image variant work, and total media persistence latency.
- Added canvas first-visible markers when generated image/video assets are applied to nodes.
- Split image original persistence from image preview/thumbnail generation:
  - default behavior remains synchronous via `WORKER_IMAGE_VARIANTS_MODE=sync`
  - async rollout is available via `WORKER_IMAGE_VARIANTS_MODE=async`
  - async variant jobs carry only `assetId` and `tenantId`; the worker reloads authoritative asset storage details from DB
- Added an idempotent image variant processor that reads persisted originals from object storage, creates image variants, uploads them, and upserts `asset_variants`.
- Added modality-specific node execution queues for `image.generate`, `video.generate`, and default node work while keeping the legacy `node.execute` queue active for rollback/compatibility.
- Added worker concurrency flags:
  - `WORKER_IMAGE_CONCURRENCY`
  - `WORKER_VIDEO_CONCURRENCY`
  - `WORKER_DEFAULT_CONCURRENCY`
- Improved video/image first-visible resilience by falling back from missing preview variants to original signed asset URLs.
- Reduced target-node generate-start latency by skipping a redundant remote draft flush only when a successful draft flush completed within the last 1.5 seconds; otherwise the previous safe flush behavior remains.
- Validation completed locally:
  - `npx vitest run src/flowCanvas/runtime/v2WorkflowRunner.test.ts`
  - `npm run test --workspace @aigc-flow/worker`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build --workspace @aigc-flow/worker`
- Notes:
  - API workflow-run queue-routing database tests are present but skipped locally without `DATABASE_URL`, following the existing test harness behavior.
  - Staging rollout and smoke validation have not been executed in this local implementation pass.

## 2026-06-14 - Canvas Menu Overlay Placement Follow-up

- Fixed remaining canvas menu overlap from staging screenshots:
  - Image node model, settings, dynamic-params, and "more" menus now render as fixed body-level overlays instead of inside the node/toolbar stacking context.
  - Image menu z-index was raised above image toolbars and overlay controls.
  - Canvas logo project menu was repositioned to a TapNow-style left-top drop-down that covers the left dock instead of opening offset into the canvas.
- Added `ImageMoreMenu` regression coverage for fixed high-layer placement.
- Validation:
  - `npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/nodes/ImageMoreMenu.test.tsx src/flowCanvas/nodes/imageMenuStyles.test.ts`
  - `npm run build`

## Recent Important Commits

- pending: fix canvas asset preview display regression
- pending: fix image edit route key fallback
- pending: fix empty asset preview bytes fallback
- pending: fix image edit save barrier stall
- pending: fix image edit runtime route selection
- pending: fix image edit result previews
- pending: fix image edit tools v2 auth workflow
- pending: fix optimistic derived image save UX
- pending: fix image generation input propagation
- `b24b42f` chore: upgrade production image to node 22
- `767ba4a` fix: make asset variant backfill run in production
- `ebed8f2` feat: add preview-backed asset pipeline
- `4af5009` feat: speed up asset previews with variants
- `dc82771` fix: align tapnow menus and node title scale
- `0b17ff8` refine tapnow menu alignment and node labels
- `339452a` fix: restore upload node handle runtime style
- `58f9d0f` refine tapnow menu density and node labels

## 2026-06-13 - Image Node Tool Source Reliability Fix

- Fixed the image-node top toolbar and More-menu tool chain after asset preview optimization exposed stale/CORS-limited signed URL usage.
- Added an authenticated same-origin asset bytes endpoint:
  - `GET /api/v2/assets/:assetId/bytes`
  - optional `variantKey=preview`
  - tenant-scoped through the existing asset read permission path
  - falls back from missing preview variant to original asset bytes for older assets
- Added object-read support to the storage provider abstraction and S3 implementation so the API can privately read object storage and return browser-safe same-origin bytes.
- Frontend image editing tools now resolve asset-backed nodes through `assetId` first instead of treating `thumbnailUrl` signed URLs as editable source data.
- Canvas overlays create local blob URLs from authenticated asset bytes, so `瑁佸壀`, `璋冩暣鍍忕礌`, `鏍囨敞`, `蹇€熷垏鍒哷, `閲嶇粯`, `鎿﹂櫎`, `鎵╁浘`, `鎵撳厜`, `澶氳搴, `澧炲己`, and `鎶犲浘` no longer depend on object-storage CORS for source-image loading.
- AI image edit requests now include `sourceAssetId` when available and use the same asset-backed source resolution before falling back to legacy URLs.
- Derived image persistence now retries remote provider result downloads through the existing image proxy when direct browser fetch is blocked, reducing downstream `Failed to fetch` result-node failures.
- Validation:
  - `npm test -- src/flowCanvas/utils/editableImageSource.test.ts`
  - `npm run build --workspace @aigc-flow/storage`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

Notes:

- Local API asset integration tests are still database-env gated in this workspace; the new bytes endpoint test was added to `apps/api/test/assets.test.ts` but is skipped locally without `DATABASE_URL`.

## 2026-06-14 - Empty Asset Preview Bytes Fallback

- Continued the image-edit blank-result investigation after browser evidence showed workflow runs and asset IDs were being created, but `/api/v2/assets/:assetId/bytes?variantKey=preview` returned `0 B image/webp`.
- Root cause narrowed to the asset bytes response layer rather than workflow launch or provider routing:
  - storage/provider metadata can report stale zero `contentLength`
  - preview variant objects can exist but contain an empty body
- Fixed the same-origin asset bytes service to:
  - always send `content-length` from the actual `Buffer.byteLength`
  - fall back to the original asset object when a requested variant body is empty
  - expose the fallback through `x-asset-variant-key: original`
- Added pure API tests for bytes normalization and database-gated route tests for stale zero content length and empty preview variant fallback.
- Validation:
  - `npm run test --workspace @aigc-flow/api -- assets-bytes-normalization.test.ts`
  - `npm run test --workspace @aigc-flow/api -- assets.test.ts` (skipped locally because DB env is not configured)
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-14 - Image Edit Route Key Fallback

- Investigated production logs for blank/placeholder image edit results.
- Server evidence showed the workflow runner and worker were not stuck:
  - API created the target-node workflow run and enqueued `node.execute`
  - worker processed the job, called the media runtime, persisted one asset, settled billing, patched the target node draft, and completed successfully
- Root cause in the log:
  - selected product model was PixelleLabs/Nano Banana, but worker runtime diagnostics showed `providerKey: "mock-local-dev"` and `routeKey: null`
  - the worker built image requests only from top-level `node.config.routeKey`; when the edit node lost that field but retained nested `imageEditRequest.routeKey`, the runtime fell back to `image.default`
- Fixed API workflow-run route context/pricing and worker image request construction to recover the route key from nested edit metadata before falling back to `image.default`.
- Fixed worker runtime diagnostics to report the same recovered route key, so production logs should no longer show `routeKey: null` for these nested image edit runs.
- Changed generated asset display URLs to same-origin `/api/v2/assets/:assetId/bytes?variantKey=preview` so canvas previews use the authenticated bytes endpoint with empty-variant fallback instead of signed preview URLs.
- Validation:
  - `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
  - `npm run test --workspace @aigc-flow/api -- workflow-pricing-resolver.test.ts`
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts`
  - `npm test -- src/services/v2AssetsApi.test.ts`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-14 - Canvas Asset Preview Display Regression

- Investigated a production regression where reopened projects and newly generated image nodes showed `棰勮鍔犺浇澶辫触`.
- Root cause:
  - canvas display code had started writing `/api/v2/assets/:assetId/bytes?variantKey=preview` into image node preview fields
  - that endpoint requires v2 Authorization headers, but browser `<img src>` requests do not attach the Bearer token
  - existing nodes with persisted `/bytes` URLs skipped preview re-resolution because `thumbnailUrl` was already populated
- Fixed canvas runtime output display to use signed preview download URLs again, with original-asset signed URL fallback when preview URL resolution fails.
- Fixed image nodes to detect previously saved authenticated `/bytes` URLs and re-resolve a signed preview URL from `assetId`.
- Added image load-error fallback from preview signed URL to original signed URL.
- Restored mojibake text in the canvas asset drawer loading/empty states.
- Validation:
  - `npm test -- src/services/v2AssetsApi.test.ts src/flowCanvas/services/flowProjectApi.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts`
  - `npm test -- src/flowCanvas/utils/editableImageSource.test.ts`
  - `npm run build`

## 2026-06-13 - Image Edit Tools v2 Auth Workflow Fix

- Fixed model-backed image tools that incorrectly showed `璇峰厛鐧诲綍鍚庡啀浣跨敤鐐规暟鍔熻兘` even when the user was logged in through v2 auth.
- Root cause:
  - the top image tools for repaint/erase/outpaint/relight/multi-angle/enhance/remove-background still executed the legacy direct model API path
  - that path checked the old local `auth-session-v1` / `X-Auth-Session` billing identity instead of the current v2 access token and `/api/v2/*` workflow path
- Frontend fix:
  - image edit confirmations now create or reuse a downstream target image node with `imageEditRequest`, prompt, route/model, mask, outpaint direction, scale, and mapped provider params
  - after the tool closes, the canvas triggers `runBackendWorkflow({ runMode: 'target_node', targetNodeId })`, so v2 auth, billing preflight, draft save barrier, worker execution, and result asset persistence own the model call
  - removed the stale direct image-edit success path from `graphExecutor.ts`
- Worker fix:
  - target-node image requests now forward `imageEditRequest` into provider-facing metadata while preserving upstream image asset inputs and mask params
- Legacy compatibility:
- remaining legacy API helper calls no longer throw the old frontend-only billing login error when a v2 access token exists
- ordinary GPT-image-2 reference-image generation still has a legacy compatibility edge and should be migrated to the v2 workflow path in a later cleanup

## 2026-06-13 - Image Edit Runtime Route Preservation Fix

- Fixed a follow-up root cause for blank/white completed results from model-backed image tools such as `閲嶇粯`, `鎿﹂櫎`, `鎵╁浘`, `鎵撳厜`, `澶氳搴, `澧炲己`, and `鎶犲浘`.
- Root cause:
  - downstream edit nodes were writing the local catalog `routeId` into `node.data.routeKey`
  - worker/API runtime route resolution matches exact runtime `routeKey`, so these edit runs could fall back to the wrong default line instead of the user-selected model line
  - when the fallback line accepted the request but did not behave as intended for the selected edit workflow, the canvas showed a completed white image result
- Frontend fix:
  - `runImageEdit()` now accepts and persists an explicit runtime `routeKey`
  - image node tool actions now pass the current selected runtime route key into downstream target-node edit runs
  - downstream `imageEditRequest` metadata now carries that runtime key too, keeping the workflow run aligned with the visible canvas line selection
- Regression coverage:
  - added a failing-then-passing test to ensure explicit runtime `routeKey` values survive downstream image edit node creation
- Validation:
  - `npm test -- src/flowCanvas/runtime/graphExecutor.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts`
  - `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts`
  - `npm run build`

## 2026-06-13 - Image Edit Launch Save Barrier Fix

- Fixed the root cause for model-backed image edit tools creating blank target cards while the relay/provider receives no request.
- Root cause:
  - users can trigger `澶氳搴, `鎵撳厜`, `閲嶇粯`, `鎿﹂櫎`, `鎵╁浘`, `澧炲己`, or `鎶犲浘` while the canvas is already showing `姝ｅ湪淇濆瓨`
  - the remote draft save barrier returned immediately when an autosave was already in flight
  - the workflow run was then created against the previous server-side draft, where the newly added edit target node was not yet available
  - API/worker execution therefore had no valid target node to enqueue, so the provider relay saw no outbound request while the canvas still showed a blank generated card
- Frontend/runtime fix:
  - `saveNow()` now refreshes the graph directly from `useFlowCanvasStore` before saving
  - if an autosave is in flight, `saveNow()` waits for it to complete and then flushes the latest graph again before workflow run creation continues
  - image edit run launch failures are no longer swallowed; target nodes are marked failed with the backend error code/message so route, pricing, queue, and target-node failures become visible on canvas
- Regression coverage:
  - added autosave timing coverage for launching a target-node run while a previous save is still in flight
  - added target-node launch error visibility coverage for API-style errors
  - added API integration coverage for an image edit child target node creating a runnable node run and enqueueing execution; this remains database-env gated locally
- Validation:
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx src/flowCanvas/runtime/graphExecutor.test.ts`
  - `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
  - `npm run test --workspace @aigc-flow/api -- workflow-runs.test.ts` (skipped locally because database test env is not configured)
  - `npm run build`
- Follow-up fix:
  - v2 workflow image/video success patches now write the resolved preview URL into `thumbnailUrl`/`posterUrl` in addition to durable `assetId`, so generated target nodes render immediately and survive remount/recovery without relying only on runtime memory state
  - image edit target nodes now store `generationRunLabel`, and the image generating overlay displays the active model/route label while waiting for the result
  - Visionary Nano Banana and PixelleLabs Gemini image adapters now merge `request.inputAssets` signed/public URLs into their provider reference-image payloads, matching the OpenAI-compatible adapter behavior and ensuring model-backed edit tools receive the source image instead of running text-only
- Validation:
  - `npm test -- src/flowCanvas/runtime/graphExecutor.test.ts`
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts`
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts`
  - `npm run build --workspace @aigc-flow/ai-gateway-core`
  - `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-13 - Image Edit Runtime Route Selection Fix

- Fixed the root cause for image edit tools producing blank white outputs while the external relay/proxy saw no requests.
- Root cause:
  - uploaded and asset-backed image nodes are created with the generic default `routeKey` value `image.default`
  - top image edit tools reused that source-node route key when creating target edit nodes
  - when the selected model had a real model-scoped route such as `image.pixellelabs.nano-banana-pro`, the stale `image.default` value could still be passed into the target-node workflow
  - worker/provider execution could therefore use the default/mock image route instead of the configured provider relay, yielding a tiny/blank generated asset and no request in the expected relay logs
- Frontend fix:
  - added `resolveActiveImageRuntimeRouteKey()` to prefer current model-scoped runtime routes and ignore stale generic `image.default` on image edit launch
  - wired image node route resolution to use that effective route before `runImageEdit()` persists target node `routeKey`
- Runtime diagnostic fix:
  - target-node launch writes `workflowLaunchStatus` on the target node through `saving_draft`, `creating_run`, `run_created`, `node_run_created`, and `worker_waiting`
  - if the backend run snapshot does not contain a `node_run` for the requested target node, the target node now fails visibly with `TARGET_NODE_RUN_MISSING` instead of staying as an idle blank white card
- Validation:
  - `npm test -- src/flowCanvas/utils/imageRuntimeRouteSelection.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/runtime/graphExecutor.test.ts`
  - `npm run build`

## 2026-06-13 - Image Edit Save Barrier Stall Fix

- Fixed the next observed blocker after route selection:
  - user-captured draft data showed the newest edit target node stuck at `workflowLaunchStatus: "saving_draft"`
  - browser Network showed `PUT /api/v2/flows/:flowId/draft` returning `200 OK`
  - no `POST /api/v2/flows/:flowId/runs` appeared, proving the provider relay/worker were not reached because frontend workflow launch never left the save barrier
- Root cause:
  - `saveNow()` shared the same recursive autosave path as background autosave
  - when an image edit run was launched while another autosave was in flight, foreground save and background follow-up flush could both observe `dirtyAgainRef` and race around the same pending graph
  - the target node could remain persisted with `workflowLaunchStatus: "saving_draft"` and no `latestWorkflowRunId`, so the canvas showed a blank target node while no workflow run request was sent
- Frontend fix:
  - added foreground flush options for `useRemoteFlowAutosave`
  - `saveNow()` now waits for any current save, then explicitly flushes the latest store graph without scheduling background follow-up recursion
  - `saveNow()` loops until the latest graph hash matches the cloud-synced hash before returning to `runBackendWorkflow()`
- Regression coverage:
  - strengthened the in-flight autosave + target-node save test to assert no extra background save is started after `saveNow()` resolves
  - added concurrent `saveNow()` coverage so multiple workflow launches waiting on the same in-flight autosave share the next foreground flush and settle together
- Validation:
  - `npm test -- src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/utils/imageRuntimeRouteSelection.test.ts src/flowCanvas/runtime/graphExecutor.test.ts`
  - `npm run build`

## 2026-06-13 - Image Derived Tool Optimistic Save Fix

- Fixed the crop confirmation UX where `纭瑁佸壀` appeared idle while the browser waited for derived-image upload and metadata persistence.
- Image-derived canvas results now use an optimistic path:
  - create the result image node immediately with the local blob/URL preview
  - close the image tool immediately for crop, resize, split, and annotation flows
  - persist the derived asset in the background
  - patch the result node with durable `assetId`, asset-backed preview data, and success state when persistence completes
- Background persistence failures now mark the newly created result node as failed while keeping its local preview visible instead of blocking the source tool or marking the source node as failed.
- Added focused tests for optimistic derived image node data, persisted patches, and failure patches.
- Validation:
  - `npm test -- src/flowCanvas/utils/optimisticDerivedImageAsset.test.ts`
  - `npm run build`

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

- Detailed implementation plan added for turning the left dock's empty `绱犳潗搴揱銆乣妯℃澘鍒楄〃`銆乣璇勮`銆乣鍘嗗彶璁板綍` entries into TapNow-style in-canvas drawers.
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
- Added the first real drawer implementation for `绱犳潗搴揱, reusing `useAssetLibrary()` to show:
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

- Executed the first production-facing backend slice for `妯℃澘鍒楄〃`.
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
- Added `CanvasTemplatePanel` so `妯℃澘鍒楄〃` drawer now has:
  - search
  - category chips
  - compact template cards
  - per-template `鎻掑叆` action
- Added `offsetTemplateGraphForInsert()` to safely remap template node/edge ids and place the incoming graph around the current canvas center.
- Added store action `mergeTemplateGraph()` so template insertion can append a graph into the current canvas while:
  - clearing the previous selection
  - selecting the newly inserted template nodes
  - recomputing graph index
  - marking the canvas dirty
- `AiFlowCanvas` now wires `妯℃澘鍒楄〃` drawer to real insertion:
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
- Added `CanvasCommentPanel` and wired the `璇勮` drawer in `AiFlowCanvas`:
  - open/resolved filter
  - selected-node chip
  - textarea + submit
  - comment list
  - `瀹氫綅` action for node comments
  - `瑙ｅ喅` action for open comments
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
- Added `CanvasHistoryPanel` and wired the `鍘嗗彶璁板綍` drawer in `AiFlowCanvas`:
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
  - `绱犳潗搴揱 now shows a dot badge when the tenant asset library has assets
  - `璇勮` now shows unresolved comment count in the dock
  - `鍘嗗彶璁板綍` now shows a dot badge once snapshot history exists
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

- Reworked the shared asset-library view model used by both the `/assets` page and the in-canvas `绱犳潗搴揱 drawer.
- Added media-category tabs for:
  - `鍥剧墖`
  - `瑙嗛`
  - `闊抽`
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

- changed local image ingestion from a blocking 鈥渦pload first, then render鈥?flow to a two-phase 鈥渓ocal preview first, background upload second鈥?flow
- added immediate local `blob:` preview rendering for image-node upload, upload-node upload, drag-and-drop upload, and paste upload
- removed the drag/paste batch blocking behavior where `Promise.all(...)` delayed every node until the whole upload batch finished
- upload and paste interactions now insert image nodes immediately and backfill `assetId` plus cloud preview URL after upload completes
- upload nodes now convert into image nodes with visible local preview first, then upgrade to cloud-backed image nodes once upload settles
- failed uploads now keep the visible local image instead of looking like 鈥渘othing happened鈥?

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
- refreshed the authenticated top shell into a TapNow-style dark creator nav with `涓婚〉`, `宸ヤ綔绌洪棿`, `绱犳潗搴揱, and `浠锋牸鏂规`
- moved account/admin actions into a right-side account menu with profile, credits, account management, model settings, help, and logout entries
- changed `/workspace` into a creator home with `浠婂ぉ瑕佸仛鐐逛粈涔堬紵`, a prompt-style input surface, recent projects, and an all-projects jump
- refreshed workspace project controls, tabs, create card, project cards, and project copy to match the denser TapNow-style project grid
- kept existing v2 auth, project listing, project creation, and project-opening behavior unchanged

Validation completed:

- `npm run test -- src/app/WorkspaceShell.test.tsx src/workspace/WorkspacePage.test.tsx src/workspace/ProjectCard.test.tsx`
- `npm run build`

### Latest Asset Library Thumbnail Tile Alignment

Completed in current local iteration:

- aligned `/assets` asset cards with the canvas asset drawer visual language: square rounded thumbnail tiles without bottom title/size metadata
- kept the `/assets` management affordance intact with the existing three-dot asset menu for preview, rename, favorite, move, download, and delete
- added a focused regression test to ensure the asset library renders canvas-style thumbnail tiles while preserving the management menu

Validation completed:

- `npm run test -- src\assets\AssetLibraryPage.test.tsx src\flowCanvas\panels\CanvasAssetPanel.test.tsx`
- `npm run build`

### Latest Production Asset and Workspace Performance Plan

Completed in current local iteration:

- created the executable production performance plan for the canvas asset drawer, `/assets`, and `/workspace`
- selected the full production-grade path: backend inline preview URLs, asset summary endpoint, project cover URL inlining, frontend cache-first hooks, windowed thumbnail rendering, performance marks, and staging validation
- documented the work as 12 executable tasks with files, tests, commands, deployment order, and acceptance checks

Plan:

- `docs/superpowers/plans/2026-06-13-production-asset-workspace-performance.md`

### Latest Production Asset and Workspace Performance Tasks 1-4

Completed in current local iteration:

- added DB indexes for tenant-scoped asset browsing, favorite filtering, variant lookup, and workspace project ordering in `000022_asset_workspace_performance.sql`
- extended `GET /api/v2/assets` to support inline preview signing with `includePreviewUrls=true`, returning `previewUrl`, `previewUrlExpiresAt`, and `previewVariantKey`
- added `GET /api/v2/assets/summary` to return one-shot image/video/audio/all counts for the asset library
- extended `GET /api/v2/projects` to support `includeCoverUrl=true`, returning signed inline project cover URLs from thumb, preview, or original assets
- added API integration coverage for the new asset preview, asset summary, and project cover URL behaviors

Validation completed:

- `npm run build --workspace @aigc-flow/db`
- `npm run build --workspace @aigc-flow/api`
- `npm run test -- src\workspace\useWorkspaceProjects.test.tsx src\assets\useAssetLibrary.test.tsx`
- `npm run build`

Notes:

- local API integration tests under `apps/api/test/*.test.ts` are present but skipped in this environment because `DATABASE_URL` is not configured locally
- frontend hooks have not been switched to the new inline preview and cover URL APIs yet; that starts in Task 5-6

### Latest Production Asset and Workspace Performance Tasks 5-7

Completed in current local iteration:

- added frontend asset session cache primitives so the asset drawer and asset library can reuse warm data within the same authenticated session
- extended the frontend asset API types to consume backend inline preview URLs and the `/assets/summary` counts endpoint
- rewrote `useAssetLibrary` to be cache-first and stale-while-revalidate: first-page assets now request `includePreviewUrls=true`, counts come from `/assets/summary`, page size drops from 60 to 30, and reopen no longer blocks on a fresh loading state when cached data exists
- removed the canvas asset drawer header search box and upload button, and removed the empty-state upload CTA so the drawer now stays focused on fast asset picking
- updated asset hook tests and canvas drawer tests to lock the new cache-first and simplified drawer behavior

Validation completed:

- `npm run test -- src/assets/assetSessionCache.test.ts src/assets/useAssetLibrary.test.tsx`
- `npm run test -- src/flowCanvas/panels/CanvasAssetPanel.test.tsx`
- `npm run build`

### Latest Production Asset and Workspace Performance Task 8

Completed in current local iteration:

- added a lightweight windowed asset thumbnail renderer for large `/assets` date groups
- `/assets` now renders the first 36 asset cards in a large group and exposes a load-more tile to expand the visible window
- kept the canvas asset drawer on the existing non-virtual compact rendering path so drawer behavior and accessibility remain unchanged
- added regression coverage that caps initial thumbnail buttons for a 120-asset group

Validation completed:

- `npm run test -- src/assets/AssetLibraryPage.test.tsx -t "limits initial thumbnail"`
- `npm run test -- src/assets/AssetLibraryPage.test.tsx src/flowCanvas/panels/CanvasAssetPanel.test.tsx`
- `npm run build`

### Latest Production Asset and Workspace Performance Task 9

Completed in current local iteration:

- extended the workspace project API client to request backend inline cover URLs with `includeCoverUrl=true`
- added a session-scoped workspace project snapshot cache keyed by authenticated user, tenant, and session
- rewrote `useWorkspaceProjects` to show cached project lists immediately on remount and refresh silently in the background
- removed the workspace hook's frontend cover signing fanout, so `/workspace` now consumes cover URLs from `GET /api/v2/projects?includeCoverUrl=true`
- added regression coverage for cache-first workspace remounts and for avoiding `/assets/signed-urls` calls during project list loading

Validation completed:

- `npm run test -- src/workspace/useWorkspaceProjects.test.tsx`
- `npm run test -- src/workspace/useWorkspaceProjects.test.tsx src/workspace/WorkspacePage.test.tsx src/assets/AssetLibraryPage.test.tsx`
- `npm run build`

### Latest Production Asset and Workspace Performance Task 10

Completed in current local iteration:

- added a tiny frontend performance mark helper that safely no-ops when browser performance APIs are unavailable
- added diagnostic timing marks around asset library refreshes:
  - `asset-library-refresh-start`
  - `asset-library-refresh-end`
  - `asset-library-refresh`
- added diagnostic timing marks around workspace project refreshes:
  - `workspace-projects-refresh-start`
  - `workspace-projects-refresh-end`
  - `workspace-projects-refresh`
- kept performance marks diagnostic-only so missing marks or unsupported APIs cannot break user flows

Validation completed:

- `npm run test -- src/performance/performanceMarks.test.ts src/assets/useAssetLibrary.test.tsx src/workspace/useWorkspaceProjects.test.tsx`
- `npm run build`


### Latest Production Asset and Workspace Performance Task 11

Completed in current local iteration:

- added a performance-specific smoke test checklist to `docs/staging-runbook.md`
- performed full local validation of the performance plan across assets, workspace, and hook caching
- verified that API performance tests pass (skipped locally due to missing DATABASE_URL, which is expected)

Validation completed:

- `npm run test -- src/assets/useAssetLibrary.test.tsx src/assets/AssetLibraryPage.test.tsx src/flowCanvas/panels/CanvasAssetPanel.test.tsx src/workspace/useWorkspaceProjects.test.tsx src/workspace/WorkspacePage.test.tsx`
- `npm run test --workspace @aigc-flow/api -- test/assets.test.ts test/projects-flows.test.ts`
- `npm run build`

### Latest Asset and Workspace Performance Staging Validation

Validated on staging:

- `/workspace` returns with visible content immediately after page switching instead of showing a blocking loading surface
- canvas asset drawer reopens without a blocking loading state after the first warm cache pass
- `/assets` first-screen thumbnail loading feels faster than the pre-optimization path
- browser Network confirms `GET /api/v2/projects?includeCoverUrl=true`
- browser Network confirms `GET /api/v2/assets?includePreviewUrls=true`
- browser Network confirms `GET /api/v2/assets/summary`
- repeated `projects?includeCoverUrl=true` requests observed during manual navigation were tied to deliberate page switching, not to blocked cache rendering

Known follow-ups:

- continue observing real staging traffic for unexpectedly repeated background refreshes outside explicit user navigation
- if needed, capture a dedicated Performance panel trace for `asset-library-refresh` and `workspace-projects-refresh`

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

### Latest Management Menu Stability Fixes

Completed in current local iteration:

- changed shared entity menus to support fixed-position anchored rendering, viewport edge clamping, and compact density for canvas drawer usage
- adjusted asset cards so compact drawer menus only show actions that have real handlers, preventing oversized empty menu blocks in the left asset drawer
- changed project deletion to use optimistic local removal plus silent refresh, avoiding full-list loading flashes after confirm delete
- wired the asset library sidebar `鏀惰棌` category to real `favorite=true` asset queries instead of a static button
- changed asset favorite/delete actions to update the visible list optimistically, so the UI responds immediately while the API call completes
- added focused regression coverage for compact drawer menus, no-flash project deletion flow, favorite-category filtering, and asset menu management flows

Validation completed:

- `npm run test -- src\workspace\WorkspacePage.test.tsx src\assets\AssetLibraryPage.test.tsx src\assets\useAssetLibrary.test.tsx src\flowCanvas\panels\CanvasAssetPanel.test.tsx`

### Latest Project Management Interaction Stabilization

Completed in current local iteration:

- moved shared rename/delete dialogs into `document.body` portals so project card transforms no longer offset modal placement
- simplified project card hover behavior and kept project action menus card-local to reduce menu positioning jitter
- made the project menu `閫夋嫨` action functional with a visible selected-count chip and selected card/list row styling
- removed asset management three-dot buttons from the canvas left asset drawer while keeping `/assets` page management menus available
- added regression coverage for body-level project rename dialogs, project selection, and hidden canvas drawer asset management buttons

Validation completed:

- `npm run test -- src\workspace\WorkspacePage.test.tsx src\assets\AssetLibraryPage.test.tsx src\assets\useAssetLibrary.test.tsx src\flowCanvas\panels\CanvasAssetPanel.test.tsx`

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

- Restyled the left in-canvas `绱犳潗搴揱 drawer toward the TapNow reference while keeping the existing grouped asset data flow unchanged.
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

- pushed `/billing` closer to the TapNow reference pricing page with an open dark dotted canvas, oversized `閫夋嫨浣犵殑濂楅` headline, larger spacing, and a yearly billing segmented control
- enlarged Basic, Pro, and Ultimate pricing cards with uppercase plan labels, a `鏈€鍙楁杩巂 Pro pill, card CTAs, and plan-specific monthly credit benefits
- kept the existing server-backed billing summary, usage, ledger, redeem, and recharge behavior unchanged below the pricing-first surface
- extended the focused billing page rendering test to lock the yearly switch, Pro highlight, card CTAs, and visible credit benefit copy

Validation completed:

- `npm run test -- src/billing/BillingCenterPage.test.tsx`

### Latest TapNow Workspace Pixel Alignment Pass 2

Completed in current local iteration:

- refined the `/workspace` home surface toward the TapNow reference with a more centered creator prompt, tighter first-screen spacing, and compact quick action chips for `AI 瑙嗛`, `鍥惧儚鐢熸垚`, `鏅鸿兘鎶犲浘`, and `鎵归噺宸ヤ綔娴乣
- refreshed the project management section from generic `椤圭洰` copy to `鎴戠殑绌洪棿` with clearer supporting text and a lighter count pill
- reduced the visual weight of project tabs, search, sort, view toggle, refresh, and create controls so the project grid reads closer to TapNow's dense product UI
- tightened create/project card dimensions, thumbnail ratios, rounded corners, metadata sizing, and hover affordances while keeping project creation/opening behavior unchanged
- extended the workspace page test coverage for the new quick actions and project section copy

Validation completed:

- `npm run test -- src/workspace/WorkspacePage.test.tsx`

### Latest Home / Workspace Split and Project Cover Pass

Completed in current local iteration:

- split the TapNow-style creator home into a dedicated `/home` route and kept `/workspace` as a standalone project management page
- updated the authenticated shell so `涓婚〉` navigates to `/home` and `宸ヤ綔绌洪棿` navigates to `/workspace` without hash-based scrolling behavior
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
- refreshed the empty project canvas start surface with `浠婂ぉ鎯冲垱浣滀粈涔堬紵`, concise guidance, and compact quick-start actions
- refreshed project canvas loading/error wording and retry action copy while keeping remote project loading and autosave behavior unchanged
- added focused tests for the canvas empty state, project loading/error/save status copy, and left dock add-node menu copy
- kept the Phase 3 scope presentation-only: no dock drawer, backend, billing, asset storage, workflow execution, or autosave semantics were changed

Validation completed:

- `npm run test -- src/flowCanvas/FlowCanvasPage.test.tsx src/flowCanvas/FlowProjectPage.test.tsx src/flowCanvas/canvas/FlowLeftAddPanel.test.tsx`

### Latest TapNow Workspace Pixel Alignment Pass

Completed in current local iteration:

- fixed the top `宸ヤ綔绌洪棿` navigation so clicking it on `/workspace` updates `#projects` and dispatches a reveal event that the workspace page can use to scroll to the project section
- separated `涓婚〉` and `宸ヤ綔绌洪棿` active states so `#projects` no longer visually behaves like the same nav target
- removed the oversized framed hero container from the workspace home and moved the first screen closer to TapNow's full-page dotted background layout
- narrowed the home content, increased the title/icon scale, tightened the prompt bar, and resized recent project cards toward the TapNow reference proportions
- restored readable Chinese copy in the workspace home loading/prompt/recent-project surfaces touched by this pass

Validation completed:

- `npm run test -- src/app/WorkspaceShell.test.tsx src/workspace/WorkspacePage.test.tsx src/workspace/ProjectCard.test.tsx`
- `npm run build`

### Latest AI Gateway Runtime Route Fix

Completed in current local iteration:

- fixed AI Gateway runtime adapter selection so provider connections use `connection.adapterKind` instead of falling back to `provider.kind`, preventing configured OpenAI-compatible image routes from silently executing the mock adapter
- kept route `api_mode`, `request_path`, and `upstream_model` as provider request configuration instead of treating them as adapter kinds
- added media output diagnostics (`aiRuntime`) to worker output JSON and generated canvas node patches so image tool results show the runtime model/provider/route actually used
- changed worker asset persistence to read image dimensions from the stored binary before writing asset refs, avoiding provider-reported `1x1` metadata from corrupting canvas node size
- strengthened worker test coverage for real generated image bytes, non-empty preview variants, measured dimensions, and runtime diagnostics

Validation completed:

- `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts provider-adapter-registry.test.ts`
- `npm run build --workspace @aigc-flow/ai-gateway-core`
- `npm run build --workspace @aigc-flow/worker`

### Latest Official Model Catalog Cleanup

Completed in current local iteration:

- kept the creator-facing image model catalog to the 3 official product models: Nano Banana Pro, Nano Banana 2, and GPT-Image-2
- kept only 4 official system image routes in the database: `image.gpt-image-2`, `image.gpt-image-2.line2`, `image.pixellelabs.nano-banana-2`, and `image.pixellelabs.nano-banana-pro`
- deleted non-official tenant/mock/legacy routes from `ai_routes`; removed related route health checks and cleared historical `ai_call_logs.route_id` references while preserving the call log rows
- changed creator-facing model route labels to product labels such as `Nano Banana Pro 绾胯矾涓€` and `GPT-Image-2 绾胯矾浜宍, without exposing provider names, upstream model names, or route keys
- changed image generation loading copy to neutral text so route/provider identifiers are not shown while a node is generating

Validation completed:

- `npx vitest run src/flowCanvas/utils/modelCatalogOptions.test.ts src/flowCanvas/runtime/graphExecutor.test.ts src/flowCanvas/utils/runtimeRouteOptions.test.ts`

### Latest Image Model Picker First-Frame Fix

Completed in current local iteration:

- removed first-frame exposure of internal model keys such as `pixellelabs.nano-banana-pro` in the image model/route picker by mapping fallback labels through product-facing names
- added cached, shared loading for image model catalog and model-scoped routes so reopening/selecting the picker does not clear visible route options while requests are in flight
- started model-scoped route loading as soon as the current model is known instead of waiting for the picker/editor open state
- added official 3-model / 4-route fallback route options so `Nano Banana Pro 绾胯矾涓€`, `Nano Banana 2 绾胯矾涓€`, and `GPT-Image-2 绾胯矾涓€/绾胯矾浜宍 can render immediately before the API response returns
- changed the empty route section to show a loading state during route fetches instead of incorrectly saying the current model has no available routes

Validation completed:

- `npx vitest run src/flowCanvas/utils/modelCatalogOptions.test.ts src/flowCanvas/runtime/graphExecutor.test.ts src/flowCanvas/utils/runtimeRouteOptions.test.ts`
- `npm run build`

### Latest Nano Banana Parameter Panel Refresh

Completed in current local iteration:

- added a dedicated `NanoBananaParamPanel` popup body for `Nano Banana Pro` and `Nano Banana 2` instead of reusing the generic image settings layout
- locked Nano Banana quality options to `1K / 2K / 4K` and ratio options to the approved 10-item two-row set even when catalog metadata is incomplete
- routed Nano Banana image nodes to the dedicated panel ahead of the dynamic-schema branch so the new UI actually renders for current catalog-backed models
- preserved the existing parameter write-back contract for `size` and `aspect_ratio`
- kept `GPT-Image-2` on the existing settings path unchanged in this iteration
- added focused regression coverage for fixed ratio ordering, all 10 visible ratio items, legacy alias handling, and GPT-image-2 isolation

Validation completed:

- `npm test -- src/flowCanvas/nodes/NanoBananaParamPanel.test.tsx src/flowCanvas/utils/modelCatalogOptions.test.ts`

### Latest GPT-image-2 Parameter Panel Refresh

Completed in current local iteration:

- added a dedicated GPT-image-2 dual-zone parameter panel instead of relying on the generic dynamic image parameter popup
- aligned the popup shell and visual language with the Nano Banana panel family while preserving GPT-image-2-specific controls for size, quality, output format, and moderation
- kept GPT-image-2 on the `size` field contract and avoided regressing it into the Nano Banana `imageSize` / `image_size` flow
- added GPT-image-2-specific fallback options for `Auto / 1K / 2K / 4K` size and the approved ratio set so the popup remains complete even when catalog metadata is sparse
- kept Nano Banana routing and all other generic image-model popup paths unchanged

Validation completed:

- `npm test -- src/flowCanvas/nodes/GptImage2ParamPanel.test.tsx src/flowCanvas/utils/modelCatalogOptions.test.ts`

### Latest MouxiHub Nano Banana Pro T3 Default Size Fix

Completed in current local iteration:

- traced the production MouxiHub T3 failure to the provider request body using the product model `gemini-3-pro-image-preview` instead of the route's size-specific upstream model
- changed the OpenAI-compatible image adapter so routes with `requestConfig.modelBySize` default a missing canvas size to `1K`
- ensured MouxiHub T3 async text-to-image requests now send `gemini-3.1-flash-image-preview` and provider size `1K` when the node does not explicitly provide a size
- added regression coverage for missing-size MouxiHub async generation to keep the product model from leaking into the upstream request path again

Validation completed:

- `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts -t "defaults MouxiHub"`
- `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts plugin-registry.test.ts`
- `npm run build --workspace @aigc-flow/ai-gateway-core`
- `npm run build --workspace @aigc-flow/worker`
- `npm run build`

### Latest Image Reference Prompt Priority Fix

Completed in current local iteration:

- traced a MouxiHub image-edit prompt mismatch to worker request construction rather than the provider: upstream reference image output prompts could override the current image node prompt
- changed image request building so the current node `generationPrompt` is sent to providers when present, while preserving the older upstream-text fallback when the image node has no own prompt
- added regression coverage for the exact reference-image case where a prior prompt like `鍔ㄧ墿杩愬姩浼氾紝3D椋庢牸` must not replace the newly typed prompt

Validation completed:

- `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts -t "keeps the current image node prompt"`
- `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
- `npm run build --workspace @aigc-flow/worker`
- `npm run test --workspace @aigc-flow/worker`
- `npm run build`

### Latest Image Prompt Channel Separation Fix

Completed in current local iteration:

- tightened image request construction so upstream outputs containing media `assets` are treated as reference media only and never contribute `prompt` or `text` to the next provider request
- allowed text-only upstream outputs to remain valid prompt inputs for image nodes
- merged text-only upstream prompt fragments with the current image node `generationPrompt` when both are present, preserving explicit text-node workflows without leaking old reference-image prompts
- added regression coverage for a mixed upstream text plus reference image case to prove old reference prompt/text values are excluded

Validation completed:

- `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts -t "combines upstream text"`
- `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
- `npm run test --workspace @aigc-flow/worker`
- `npm run build --workspace @aigc-flow/worker`
- `npm run build`

### Latest Official Image Pricing Refresh

Completed in current local iteration:

- updated official image model pricing by route and size: Nano Banana Pro line one `4/4.5/5`, Nano Banana 2 line one `2.5/3/3.5`, GPT-Image-2 line one `2.5/3/3.5`, GPT-Image-2 line two `3/3.5/4`
- kept MouxiHub Nano Banana Pro line two T3 pricing unchanged at `6/8/12`
- added decimal billing support for pricing, reservation, ledger, and usage amounts so half-credit prices are stored and settled accurately instead of being truncated
- added a production migration to update existing `model_pricing` rows and convert billing amount columns to `numeric(18,4)`
- changed the image prompt bar point display to calculate the current points from active route key plus selected `1K/2K/4K` size so the bottom-right value updates immediately when model, line, or quality changes

Validation completed:

- `npm run test --workspace @aigc-flow/api -- workflow-pricing-resolver.test.ts -t "preserves decimal"`
- `npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts`
- `npx vitest run src/flowCanvas/utils/imageRoutePricing.test.ts`
- `npm run build --workspace @aigc-flow/api`
- `npm run build --workspace @aigc-flow/db`
- `npm run build --workspace @aigc-flow/ai-gateway-core`

## 2026-06-15 - Scheme C Home Workspace Auth Refresh

- refreshed `/home`, `/workspace`, `/login`, and `/register` toward the approved Scheme C premium product direction
- reduced the old oversized prompt dominance on `/home` and replaced it with a brand-led hero, lighter quick-start entry, capability preview, and recent-project continuation
- reorganized `/workspace` around a unified control bar and project-first layout while keeping existing project actions and creation behavior intact
- tightened the shared auth shell so login/register use a more compact desktop-first layout and keep primary actions within standard first-screen desktop view without relying on page scrolling
- normalized the touched auth/workspace/home test copy to readable Chinese in the refreshed surfaces
- Validation:
  - `npm test -- src/auth/AuthPages.test.tsx src/workspace/HomePage.test.tsx src/workspace/WorkspacePage.test.tsx`
  - `npm run build`

## 2026-06-15 - GPT-Image-2 Parameter Panel UI Consistency Pass

- cleaned the dedicated GPT-image-2 parameter panel so the visible section labels are readable Chinese and the summary strip uses the shared `路` separator instead of corrupted characters
- widened and rebalanced the dual-zone GPT panel layout to reduce right-column crowding for quality, output format, and moderation controls
- tightened GPT panel chip typography with nowrap behavior so compact English option labels stay aligned with the rest of the canvas parameter surfaces
- normalized image route user-facing Chinese labels in the catalog option helpers so model line menus no longer surface mojibake strings
- Validation:
  - `npm test -- src/flowCanvas/nodes/GptImage2ParamPanel.test.tsx src/flowCanvas/utils/modelCatalogOptions.test.ts`
  - `npm run build`

## 2026-06-15 - Image Batch Credit Display Fix

- traced the image prompt-bar credit mismatch to a frontend-only display bug: the bottom-right credit pill was rendering the single-image route price and ignored the selected `batchCount`
- added a shared image credit display helper that multiplies the route unit price by the selected generation quantity for UI display
- updated the image node prompt bar so switching from `1x` to `2x`/`3x`/`4x` immediately updates the displayed required credits
- added a regression test covering quantity-aware display pricing for decimal and whole-credit routes
- Validation:
  - `npm test -- src/flowCanvas/utils/imageRoutePricing.test.ts src/flowCanvas/utils/modelCatalogOptions.test.ts src/flowCanvas/nodes/GptImage2ParamPanel.test.tsx`
  - `npm run build`

## 2026-06-15 - MouxiHub T3 Async Quantity Aggregation

- changed the official MouxiHub Nano Banana Pro T3 async route so image quantity greater than `1` no longer relies on a single upstream async task carrying `n > 1`
- the AI Gateway now splits `image.mouxihub.nano-banana-pro.t3` requests into multiple async provider create calls with single-image payloads and returns an aggregated provider-task list
- the worker waiting-provider state now supports multiple provider tasks for a single node run while remaining backward-compatible with the older single-task shape
- provider polling now updates per-task progress, waits until all async provider tasks succeed, then aggregates all outputs into one final asset persistence + one billing settle
- this keeps official T3 behavior aligned with the other multi-image routes that already satisfy quantity by repeated provider requests instead of trusting one provider task to return multiple outputs
- Validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts`
  - `npm run test --workspace @aigc-flow/worker -- worker.test.ts`
  - `npm run build --workspace @aigc-flow/ai-gateway-core`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-15 - Image Multi-Result Display Mode

- added a new persisted image-node display mode so multi-image generation can be shown either as `combined` results on the parent node or as `split_nodes`
- image prompt bars now reveal an inline display-mode switch next to the existing `2x / 3x / 4x` quantity control when the selected batch count is greater than `1`
- kept the existing combined-result strip behavior as the default path for backward compatibility
- added split-mode fan-out behavior on successful multi-image runs:
  - keep the parent image node in place
  - create one generated child image node per output asset
  - connect each child from the parent node
  - suppress duplicate parent filmstrip rendering for that same split-delivered batch
- kept the implementation frontend-only in the canvas/store/workflow runner layer without changing the backend workflow contract
- Validation:
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/store/flowCanvasStore.test.ts`
  - `npm run build`

## 2026-06-15 - MouxiHub T3 Aspect Ratio Forwarding Fix

- traced the official MouxiHub Nano Banana Pro T3 ratio mismatch to the OpenAI-compatible image adapter layer rather than the canvas or worker request builder
- confirmed frontend and worker metadata already preserved the selected image ratio, but the async MouxiHub generation payload dropped it before the upstream provider request was created
- updated the OpenAI-compatible adapter so the official MouxiHub T3 route forwards the selected ratio as `aspect_ratio` in the upstream generation payload
- added a focused regression test for the exact `2K + 3:4` official T3 request path to prevent future regressions where MouxiHub falls back to its provider default ratio
- Validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts -t "generateImage forwards MouxiHub async generation aspect ratio to upstream payload"`
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts`
  - `npm run build --workspace @aigc-flow/ai-gateway-core`

## 2026-06-15 - GPT-Image-2 MouxiHub Async Lines 3 and 4

- added a built-in AI Gateway plugin package for `GPT-Image-2` MouxiHub async routes `image.gpt-image-2.line3` and `image.gpt-image-2.line4`
- line 3 now maps size tiers to upstream models:
  - `1K -> gpt-image-2`
  - `2K -> gpt-image-2-2k`
  - `4K -> gpt-image-2-4k`
- line 4 now maps size tiers to upstream models:
  - `1K -> gpt-image-2-vip`
  - `2K -> gpt-image-2-vip-2k`
  - `4K -> gpt-image-2-vip-4k`
- kept all GPT-Image-2-specific size behavior aligned with the existing dedicated panel/runtime rules instead of reusing the Nano Banana size contract
- kept MouxiHub async generation/edit integration on:
  - `/v1/images/generations?async=true`
  - `/v1/images/edits?async=true`
  - `/v1/images/tasks/{task_id}`
- kept GPT-Image-2 quantity behavior aligned with the current multi-image safety path by preserving one-image-per-request upstream splitting when the requested image count is greater than `1`
- extended creator-facing route metadata so fallback labels, route ordering, and frontend pricing now include:
  - `GPT-Image-2 绾胯矾涓塦
  - `GPT-Image-2 绾胯矾鍥沗
- cleaned the touched GPT-Image-2 MouxiHub plugin/catalog metadata to readable Chinese labels so the new lines do not surface mojibake in canvas or admin-adjacent views
- Validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts runtime.test.ts`
  - `npm run test --workspace @aigc-flow/api -- ai-plugins.service.test.ts`
  - `npx vitest run src/flowCanvas/utils/imageRoutePricing.test.ts src/flowCanvas/utils/modelCatalogOptions.test.ts`
  - `npm run build`

- follow-up template split:
  - split the original combined MouxiHub GPT-Image-2 template into two independent template-library entries:
    - `GPT-Image-2 绾胯矾涓塦
    - `GPT-Image-2 绾胯矾鍥沗
  - each template now installs only its own route so the initializer can bind a different API key per line instead of forcing both lines through one shared template credential
  - provider connection names are now package-scoped during template install, preventing split templates from accidentally reusing the same generated connection/credential because of a shared display-name-based connection key
  - the split line templates are route-only install templates and do not republish duplicate `gpt-image-2` catalog entries, so the creator-facing GPT-Image-2 model directory remains stable while the extra lines stay independently installable
## 2026-06-15 - AI Route Test Admin Permission Alignment

- unified the AI route test endpoint `POST /api/v2/admin/ai/routes/:routeId/test` with the rest of the admin/model-management surfaces by requiring `admin:system`
- removed the old `provider:manage` mismatch that let users open the admin AI pages but blocked the route test action itself
- updated API regression coverage so:
  - the admin-email owner can install the mock plugin and run route tests
  - a non-admin tenant viewer is rejected with `403` and `Missing permission: admin:system`

## 2026-06-15 - Model Catalog Route ID Tenant Priority Fix

- traced the new `Route not found or is not active` admin/model-center error to the model-catalog route list query rather than the upstream providers
- confirmed the frontend route test action was receiving the wrong `routeId` when the same `route_key` existed in both a system route and a tenant-installed route
- fixed `ai-model-catalog` route ordering so the current tenant's route record is preferred over the system fallback for the same `route_key`
- added regression coverage for the exact duplicate-route-key case to ensure model-center route lists keep returning the tenant route id
- validation:
  - `npm run test --workspace @aigc-flow/api -- ai-model-catalog.test.ts` (skipped locally because database test env is unavailable)
  - `npm run build`

## 2026-06-15 - MouxiHub GPT-Image-2 Async Payload Compatibility Fix

- traced the remaining `The provider returned an internal error` failures for GPT-Image-2 lines 3 and 4 to request-shape mismatches against MouxiHub's async image docs rather than route selection
- confirmed MouxiHub async GPT-image generation docs only require the basic image payload and do not document the extra `aspect_ratio` parameter for these routes
- confirmed MouxiHub async image-edit docs use multipart field `image` for uploaded source images rather than the older `image[]` field used by other compatible routes
- updated the OpenAI-compatible image adapter so:
  - `image.gpt-image-2.line3` and `image.gpt-image-2.line4` never forward `aspect_ratio`
  - `image.gpt-image-2.line3` and `image.gpt-image-2.line4` always send edit uploads under multipart field `image`
  - the runtime override applies even for already-initialized routes whose saved `request_config` still contains older template values
- aligned the MouxiHub GPT-Image-2 manifests and runtime regression coverage with the corrected request shape
- validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts -t "MouxiHub GPT-Image-2"`
  - `npm run build`

## 2026-06-15 - MouxiHub GPT-Image-2 Lines 3 and 4 Size-Tier Model Routing Alignment

- re-checked MouxiHub `GPT-Image-2` lines 3 and 4 against the working size-tier model selection pattern instead of continuing the earlier raw-tier payload attempt
- confirmed the desired provider contract for these MouxiHub async lines is:
  - choose the upstream model directly from the selected size tier
  - keep request `size` on GPT-image-compatible pixel dimensions instead of raw `1K / 2K / 4K`
  - forward the selected `aspect_ratio`
  - avoid the invalid `size: 1K / 2K / 4K` MouxiHub payload shape that caused upstream failures
- updated the OpenAI-compatible image adapter so:
  - `image.gpt-image-2.line3` maps `1K / 2K / 4K` to `gpt-image-2 / gpt-image-2-2k / gpt-image-2-4k`
  - `image.gpt-image-2.line4` maps `1K / 2K / 4K` to `gpt-image-2-vip / gpt-image-2-vip-2k / gpt-image-2-vip-4k`
  - both lines now keep GPT-image-style pixel-size normalization while still using size-tier upstream model selection
- updated the GPT-image edit mapping so creator-side edit payload metadata for GPT-image-2 also stays on pixel `size` plus `aspect_ratio`, matching the generation/runtime contract
- added regression coverage proving:
  - line 3 async generation sends `model: gpt-image-2-2k`, `size: 2512x1664`, `aspect_ratio: 3:2`
  - line 4 async edit uses `gpt-image-2-vip-4k`
  - stale legacy `requestConfig.model` values no longer override line 4 size-tier routing or revert to the wrong base model
- validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts -t "size-mapped upstream model and pixel size payload|explicit vip size-mapped model with pixel size payload"`
  - `npm run test --workspace @aigc-flow/ai-gateway-core`
  - `npm run build`

## 2026-06-16 - Admin AI Model Center System Route Disable Fix

- traced the non-working "鍋滅敤绾胯矾" action to frontend gating in the AI model center instead of an API or database failure
- confirmed `admin:system` users could already update system-route status through the admin route update API, but the page blocked the action in two places:
  - the disable button was hard-disabled for non-tenant routes
  - the click handler returned early for system routes before calling `updateAdminRoute`
- updated the model-center route management UI so non-default system routes can now be disabled or re-enabled directly from the page, while the existing protection for default routes remains in place
- added a focused regression test covering the exact scenario: a non-default system route is selectable and sends `status: inactive` through `updateAdminRoute`
- validation:
  - `npm test -- src/account/ai-settings/AiSettingsPage.test.tsx`
  - `npm run build`
## 2026-06-16 - Canvas GPT-Image-2 Disabled Route Visibility Fix

- traced the still-visible `GPT-Image-2 线路三 / 线路四` canvas menu issue to frontend fallback data rather than the admin disable action or route-status persistence
- confirmed the canvas image model picker kept a hard-coded GPT-Image-2 fallback route list that still included lines 3 and 4, so those routes could reappear even after the backend route list no longer returned them
- moved the official image fallback route definitions into shared runtime-route helpers and limited the GPT-Image-2 fallback set to line one and line two only
- updated the canvas model-scoped route loader so cached route lists are shown immediately but still trigger a background refresh, preventing stale same-session route caches from keeping recently disabled lines visible
- added a focused regression test to lock the GPT-Image-2 fallback route set to:
  - `image.gpt-image-2`
  - `image.gpt-image-2.line2`
- validation:
  - `npm test -- src/flowCanvas/utils/runtimeRouteOptions.test.ts`
  - `npm run build`

## 2026-06-16 - Image Prompt Bar Final Single-Row Layout

- rebuilt the canvas image-node bottom generation controls toward the approved final single-row layout
- credits now render as a horizontal ?? N pill and the send button sits independently on the far right
- GPT-Image-2 and Nano Banana Pro states now share the same generation-toolbar structure instead of drifting into separate right-side layouts
- cleaned mojibake regressions in the multi-image toggle and the dedicated Nano Banana / GPT-Image-2 parameter panels
- added focused component coverage for the generation toolbar plus the refreshed Chinese labels in the prompt-bar control family
- validation:
  - npm test -- src/flowCanvas/nodes/ImageGenerateToolbar.test.tsx src/flowCanvas/nodes/MultiImageDisplayModeToggle.test.tsx src/flowCanvas/nodes/NanoBananaParamPanel.test.tsx src/flowCanvas/nodes/GptImage2ParamPanel.test.tsx
  - npm run build

## 2026-06-16 - Canvas Agent Production Assistant Design

- Added the formal Canvas Agent design spec at `docs/superpowers/specs/2026-06-16-canvas-agent-design.md`.
- Defined the Agent as a canvas production coordinator rather than a plain chat assistant.
- Documented the recommended direction: TapNow-style entry and side panel, Infinite Canvas-style structured canvas ops, TapCanvas-style evidence-first production principles, and the existing TapFlow v2 workflow/billing/assets execution path.
- Covered user-facing capabilities, panel structure, `CanvasAgentOp` protocol, tool permissions, backend API/session tables, execution flow, billing and asset rules, security constraints, staged implementation plan, risks, and acceptance criteria.
- No product code was changed in this design-only step.

## 2026-06-16 - Canvas Agent Implementation Plan

- Added the executable implementation plan for the first Canvas Agent wave at `docs/superpowers/plans/2026-06-16-canvas-agent-implementation.md`.
- The plan breaks the Agent work into concrete tasks covering frontend protocol/snapshot/policy/executor, Agent panel UI, server session and streaming planning, confirmed canvas writes, and existing target-node workflow generation integration.
- The first wave intentionally excludes long-term memory, MCP, multi-agent collaboration, automatic model/plugin installation, and complex storyboard state machines.
- The plan keeps provider/baseUrl/API key/upstream route internals out of creator-facing Agent UI and preserves the v2 workflow/billing/assets execution chain.
- No product code was changed in this planning step.

## 2026-06-16 - Canvas Agent Final Stage Implementation Plan

- Added the second-stage final Agent implementation plan at `docs/superpowers/plans/2026-06-16-canvas-agent-final-stage-implementation.md`.
- The plan continues from the first-stage Agent MVP and expands it into project memory, production semantics, storyboard planning, batch orchestration, failure diagnosis, recipe reuse, safe model-line recommendation, controlled automation, optional external tools, role orchestration, evaluation, and admin observability.
- Updated the first-stage Agent implementation plan with an explicit final-stage handoff section so the work can move directly into stage two after the first 16 tasks pass acceptance.
- The plan keeps the existing v2 workflow/billing/assets path as the only generation execution path and continues hiding provider/baseUrl/API key/raw route/upstream model details from creator-facing UI.
- No product code was changed in this planning step.

## 2026-06-16 - Image Prompt Multi-Image Mode Compact Dropup

- Replaced the two-segment multi-image display mode control with a compact single-value dropup that matches the height and density of the quantity selector.
- Moved the multi-image mode trigger directly after the quantity control so model, parameters, quantity, and display mode stay on one continuous row.
- Kept the credits pill and send button pinned to the right side with a flexible spacer instead of letting the display-mode control crowd or clip them.
- Added focused regression coverage for the compact dropup trigger, menu selection behavior, and one-row action layout.
- validation:
  - `npm run test -- src/flowCanvas/nodes/ImagePromptActionRow.test.tsx src/flowCanvas/nodes/ImageGenerateToolbar.test.tsx src/flowCanvas/nodes/MultiImageDisplayModeToggle.test.tsx src/flowCanvas/nodes/NanoBananaParamPanel.test.tsx src/flowCanvas/nodes/GptImage2ParamPanel.test.tsx`
  - `npm run build`

## 2026-06-16 - Image Prompt Bottom Control Pill Alignment

- Unified the image prompt bottom-row quantity, multi-image display mode, credits, and send controls onto the same 42px pill height.
- Changed the `2x` quantity trigger and multi-image display-mode trigger to use the same fully rounded pill shape as the model and parameter controls.
- Tightened the credits/send pill by reducing the credits minimum width so `点数 12` stays compact instead of stretching across the right side.
- Cleaned the related Chinese labels in the generate toolbar and multi-image display-mode control.
- validation:
  - `npm run test -- src/flowCanvas/nodes/ImagePromptActionRow.test.tsx src/flowCanvas/nodes/ImageGenerateToolbar.test.tsx src/flowCanvas/nodes/MultiImageDisplayModeToggle.test.tsx src/flowCanvas/nodes/NanoBananaParamPanel.test.tsx src/flowCanvas/nodes/GptImage2ParamPanel.test.tsx`
  - `npm run build`

## 2026-06-16 - Canvas Agent Build Blocker Recovery

- Restored the repo to a clean full-build state while keeping the Stage 1 Canvas Agent implementation in place.
- Fixed the image prompt generate toolbar files after they had fallen into a broken/garbled state that caused parser and module-resolution failures around `ImageGenerateToolbar`.
- Normalized the visible toolbar labels back to creator-facing Chinese copy (`点数`, `开始生成`, `生成中`) and kept the existing one-row layout and interaction model unchanged.
- Hardened the API workspace build path by adding an `@aigc-flow/api` `prebuild` step that compiles `@aigc-flow/db` and `@aigc-flow/ai-gateway-core` first, preventing stale workspace declaration output from breaking clean-environment API builds.
- validation:
  - `npm test -- src/flowCanvas/nodes/ImageGenerateToolbar.test.tsx src/flowCanvas/nodes/ImagePromptActionRow.test.tsx`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build --workspace @aigc-flow/db`
  - `npm run build`

## 2026-06-16 - GPT-5.5 Text Model Gateway Integration

- Added a built-in AI Gateway text plugin for `GPT-5.5` through SiphonLab.
- The template creates the `text.gpt-5-5` route for text nodes and Agent planner usage:
  - base URL: `https://sub.siphonlab.cn`
  - upstream model: `gpt-5.5`
  - chat endpoint: `/v1/chat/completions`
  - responses endpoint metadata: `/v1/responses`
  - pricing: `2` credits per text generation
- New text nodes now default to `modelId: gpt-5.5` and `routeKey: text.gpt-5-5`, while non-integrated legacy text model options keep `text.default` as a fallback route.
- Extended the OpenAI-compatible text adapter so text routes can opt into the Responses API via route request config while preserving the existing chat-completions default path.
- Added `AGENT_PLANNER_ENABLED` and `AGENT_TEXT_ROUTE_KEY` to the staging compose runtime env map so server env settings are visible inside API/worker containers.
- Updated staging environment docs with the new CredentialVault-backed `SIPHONLAB_GPT_5_5_API_KEY` placeholder and the recommended Agent route key `text.gpt-5-5`.
- Validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts runtime.test.ts -t "GPT-5.5|responses API when configured|filters by modality"`
  - `npm run test --workspace @aigc-flow/api -- ai-plugins.service.test.ts`
  - `npm test -- src/flowCanvas/utils/nodeFactory.test.ts`

## 2026-06-16 - Real LLM Canvas Agent Design

- Added the real large-model Canvas Agent connection design at `docs/superpowers/specs/2026-06-16-real-llm-canvas-agent-design.md`.
- Compared the relevant Agent patterns from `CookSleep/gpt_image_playground`, `basketikun/infinite-canvas`, and `anymouschina/TapCanvas` against the current TapFlow v2 architecture.
- Documented the recommended Stage 1.5 direction: make the AI Gateway text route the primary Agent planner, keep deterministic planning only as explicit fallback, add strict JSON parsing, repair retry, output redaction, policy validation, planner observability, and staging rollout flags.
- The design preserves the existing `CanvasAgentOp` confirmation boundary and v2 workflow/billing/assets execution chain, and keeps provider/baseUrl/API key/raw route/upstream model internals out of creator-facing UI.
- No product runtime code was changed in this design-only step.

## 2026-06-17 - Independent Image Workbench Design

- Added the formal Scheme C independent image workbench design at `docs/superpowers/specs/2026-06-17-independent-image-workbench-design.md`.
- Clarified that the future workbench is a top-level `/workbench` product surface, not a project-scoped `/projects/:projectId/workbench` mode.
- Locked the approved UX direction:
  - desktop uses a professional left-parameters plus right-result-flow layout
  - mobile uses a result-feed-first layout with a bottom composer inspired by JiMeng mobile creation flows
  - workbench results are stored in independent server-side history first, with `发送到画布` as an explicit secondary action
- Documented the required backend shape for tenant-scoped workbench history, server-side billing, AI Gateway execution, cloud asset persistence, and safe send-to-project insertion.
- No product runtime code was changed in this design-only step.

## 2026-06-17 - Independent Image Workbench Implementation Plan

- Added the executable implementation plan at `docs/superpowers/plans/2026-06-17-independent-image-workbench.md`.
- The plan decomposes the approved workbench into database, queue, API, worker, frontend route/navigation, desktop composer, mobile composer, result actions, send-to-project, and old project-scoped workbench cleanup tasks.
- The plan explicitly keeps workbench history server-side, uses the existing AI Gateway and cloud asset pipeline, requires billing reserve/settle/refund, and handles async provider polling before marking workbench generations complete.
- No product runtime code was changed in this planning step.

## 2026-06-17 - Independent Image Workbench Runtime Landing

- added the first end-to-end independent `/workbench` creator surface as a standalone authenticated route instead of a project-scoped mode
- added tenant-scoped backend workbench persistence:
  - `workbench_sessions`
  - `workbench_generations`
  - `workbench_results`
- added `/api/v2/workbench/*` API routes for:
  - generation history listing
  - generation creation
  - generation detail lookup
  - retry generation
  - send result to project/canvas
- added the `workbench.generate` queue contract and worker execution path so workbench image generations now reuse the existing AI Gateway, billing reserve/settle/refund, cloud asset persistence, and async provider polling flow
- updated `MediaAssetStore` so workbench outputs can be persisted without workflow/node ids while still creating normal asset records and variants
- added the new frontend workbench feature area under `src/workbench/*` with:
  - desktop left-parameter plus right-result-feed layout
  - mobile bottom composer entry with result-first feed behavior
  - model-aware Nano Banana / GPT-Image-2 parameter panels
  - result actions for `再次生成`, `复用参数`, and `发送到画布`
- moved product navigation forward so the shared shell now includes a first-class `/workbench` entry
- removed the old mobile auto-redirect that previously forced `/projects/:projectId` into project-scoped workbench mode
- changed `/projects/:projectId/workbench` into a compatibility redirect to `/workbench` instead of keeping it as the promoted product path
- validation:
  - `npm run test --workspace @aigc-flow/api -- workbench.test.ts`
  - `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts`
  - `npm run test -- src/app/WorkspaceShell.test.tsx src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx src/workbench/WorkbenchPage.test.tsx`
  - `npm run build --workspace @aigc-flow/redis`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-17 - Independent Workbench Model/Reference Hotfix

- fixed the standalone `/workbench` image model source so it now prefers the same v2 AI model catalog mapping used by canvas image flows instead of falling back to legacy local-only image model definitions
- this restores workbench model ordering and display alignment with the canvas picker, including the active Nano Banana / GPT-Image-2 product grouping and route family behavior
- upgraded the shared asset upload button with an optional per-asset completion callback while keeping the existing `onUploaded` behavior unchanged for current callers
- wired the workbench reference area to real asset upload flow so uploaded reference images immediately append their `assetId` into the current workbench draft
- cleaned the main standalone workbench surface copy around composer, result feed, mobile composer, result sheet, and send-to-project dialog so newly touched UI no longer shows the recent garbled text regression in these flows
- validation:
  - `npm run test -- src/hooks/useImageModelCatalog.test.tsx src/workbench/WorkbenchPage.test.tsx`
  - `npm run test -- src/app/WorkspaceShell.test.tsx src/workbench/WorkbenchPage.test.tsx src/hooks/useImageModelCatalog.test.tsx`
  - `npm run test -- src/assets/UploadAssetButton.test.tsx`
  - `npm run build`

## 2026-06-17 - Workbench Generation State and Reference UX Fix

- fixed the `/workbench` generation worker flow so external provider calls and polling no longer run inside one long database transaction, preventing provider success/failure state from being hidden by transaction rollback
- persisted `waiting_provider` plus `provider_task_id` for workbench async image tasks and reused existing provider task ids for stale retries instead of issuing duplicate upstream requests
- changed workbench async provider polling from a single immediate poll to bounded condition polling before failing the generation
- made frontend workbench polling resilient to temporary generation-detail errors and resumed polling for non-terminal history rows after page load
- rebuilt the desktop/mobile workbench composer reference image area so uploaded references show thumbnails, labels like `图1`, remove controls, and one-click `@图N` insertion
- added prompt reference filtering so `@图2` sends only the selected reference asset to the backend, while prompts without valid tags continue to send all selected references
- simplified workbench model parameters to one shared dropdown layout and removed duplicate Nano Banana / GPT-Image-2 parameter panels from the workbench composer
- prefetched and cached workbench route options by model route family to reduce the visible route-selector delay when switching models
- cleaned newly touched workbench, upload, and model-route UI copy to avoid the recent garbled text regression
- validation:
  - `npm run test -- src/workbench/workbenchReferences.test.ts src/workbench/WorkbenchPage.test.tsx`
  - `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-17 - Workbench Preview and Result Display Hotfix

- fixed `/workbench` reference uploads so selected image files show a local `blob:` preview immediately instead of waiting for the server upload response
- changed uploaded reference handling to replace the temporary local preview with the real asset id and then fetch a signed preview URL even when the upload response does not include `previewUrl`
- added result-card and result-detail fallbacks that fetch signed preview URLs from `assetId` when workbench generation results do not include a direct preview URL
- made frontend workbench polling continue for the edge case where a generation is marked `succeeded` before its `workbench_results` rows are visible to the list/detail API
- cleaned the newly touched workbench upload/composer/result UI copy after the recent garbled-text regression
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`

## 2026-06-17 - Asset Library Drag Multi-select

- added desktop drag-box selection to the v2 `/assets` library so users can marquee-select visible asset tiles from either grid gaps or a thumbnail tile
- added selected thumbnail styling with a check indicator and a sticky bulk action bar showing the selected count
- added bulk delete confirmation that deletes the selected assets through the existing authenticated v2 asset delete path and clears stale selection as the asset list changes
- added regression coverage for drag-selecting multiple assets, suppressing preview opens after drag selection, and bulk deleting only the selected assets
- validation:
  - `npm test -- src/assets/AssetLibraryPage.test.tsx`
  - `npm run build`

## 2026-06-17 - Asset Library Drag Selection Browser Fix

- fixed the drag multi-select interaction for real browsers by disabling native image/video dragging inside asset tiles
- changed marquee selection startup to call `preventDefault()` and attach window pointer listeners synchronously on pointer down, avoiding lost pointer move events during browser media drag
- extended regression coverage for disabled native thumbnail dragging and prevented default drag behavior
- validation:
  - `npm test -- src/assets/AssetLibraryPage.test.tsx`
  - `npm run build`

## 2026-06-17 - Workbench Billing Model UUID Hotfix

- fixed a worker-side workbench failure where successful provider image generations could still be marked failed during settlement
- root cause: `/workbench` stores product model keys such as `pixellelabs.nano-banana-pro` in `workbench_generations.model_id`, but `usage_events.model_id` is an internal `ai_models.id` UUID field
- changed workbench settlement so usage events leave the UUID `modelId` field as `null` and preserve the product model key in usage metadata as `productModelId`
- this keeps billing records valid while retaining model auditability for standalone workbench generations
- validation:
  - `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-17 - Workbench Composer Visual Refresh

- refreshed the standalone `/workbench` desktop composer to better match the approved reference-style creator panel
- rebuilt the left panel around:
  - compact dashed reference-image filmstrip with `0/10` capacity, thumbnail cards, remove controls, and a single visible upload entry
  - prompt header with optimize action and reference `@图N` usage hint
  - compact model, aspect ratio, size, route, and quantity dropdown controls
  - current configuration cost card and gradient primary creation button
- preserved the existing workbench backend flow, model catalog source, route prefetching, reference upload behavior, `@图N` filtering, and multi-image display mode behavior
- added focused regression coverage for the new compact composer controls
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`

## 2026-06-17 - Workbench Reference Upload UI Hotfix

- removed the shared `UploadAssetButton` from the standalone workbench reference strip because it still rendered its generic upload result panel after image upload
- replaced it with a workbench-specific hidden file input that keeps the approved compact reference strip UI only
- reference images now show local thumbnails immediately while upload continues, then swap to the persisted asset id and signed preview URL after completion
- reference thumbnails stay horizontal with compact `图N` badges; uploaded file names and the generic `上传结果` list are no longer rendered in the workbench composer
- added regression coverage to ensure reference upload does not surface `上传结果` or uploaded file names in the composer
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`

## 2026-06-17 - Workbench Reference Strip and Parameter Layout Follow-up

- updated the standalone `/workbench` reference strip to match the annotated review:
  - reference thumbnails can be reordered by mouse drag and drop
  - per-image remove buttons stay hidden until the card is hovered or focused
  - the reference strip uses a visible horizontal scrollbar instead of wrapping into vertical rows
- adjusted the composer parameter layout so:
  - model selection remains its own full-width row
  - route selection is now its own full-width row under the model selector
  - aspect ratio, size, and quantity stay together in one compact three-column row
- extended regression coverage for reference-strip scrollbar visibility, hover-only remove controls, drag reorder behavior, and the route/parameter row split
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`

## 2026-06-17 - Workbench Dropdown Direction and Aspect Icons

- changed the compact workbench select popovers to open upward so lower controls do not cover the cost card or generate button
- updated aspect-ratio option icons so each rectangle reflects its actual ratio, for example `9:16` renders tall and `16:9` renders wide
- kept the same compact menu styling and added regression coverage for upward menu placement and ratio-specific icon dimensions
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`

## 2026-06-17 - Workbench Temporary Reference Uploads

- added workbench-only temporary reference uploads so uploaded workbench references no longer create `assets` records or use browser direct OSS upload
- added `workbench_reference_uploads` plus `workbench_generations.reference_upload_ids`; worker hydrates temporary uploads as inline image data for provider requests
- switched the workbench composer to upload references through `/api/v2/workbench/reference-uploads` while keeping local preview and `@图N` filtering behavior
- validation:
  - `npm run test -- apps/api/test/workbench.test.ts`
  - `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts`
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build --workspace @aigc-flow/db`

## 2026-06-17 - Workbench Reference Strip Scrollbar

- replaced the native reference-strip scrollbar with a stable in-app scrollbar track/thumb so the horizontal indicator is always visible below uploaded reference cards
- kept horizontal scrolling on the reference card row while hiding browser-specific scrollbars that were not rendering consistently in production
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`

## 2026-06-17 - Workbench Reference Scrollbar States

- refined the workbench reference strip scrollbar to match the compact TapNow-style state behavior: no scrollbar when the strip is empty or not overflowing, and a small gray scrollbar only when extra references require horizontal navigation
- added left/right scroll controls plus track jump and thumb drag handling so the visible scrollbar is an actual control instead of a static indicator
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`

## 2026-06-17 - Fullscreen Workbench Studio Shell

- changed `/workbench` so it now renders outside `WorkspaceShell` instead of inheriting the homepage/global navigation shell
- rebuilt the route as a fullscreen studio surface aligned to the approved Scheme C direction:
  - existing left-side workbench composer UI is preserved as-is
  - center stage now shows the current primary result in a dedicated large preview area
  - right column now keeps the generation history flow visible at the same time
- kept workbench result detail and `发送到画布` behavior available from the new fullscreen surface
- kept the mobile workbench bottom composer attached so mobile generation entry still works after the desktop shell rewrite
- updated workbench route tests to assert the new fullscreen-shell behavior and the intentional duplicated result presence between the center stage and right-side history
- validation:
  - `npm test -- src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`
