# Codex Handoff

## Current Sprint Handoff (ai-provider-dev-seed-mock-e2e)

Branch:

- `ai-provider-dev-seed-mock-e2e`

Implemented:

- Added `npm run dev:seed-ai`.
- Added tenant-scoped local AI baseline seed for mock provider/model/routes/credential/pricing.
- Seeded routes:
  - `image.default`
  - `image.fail`
  - `video.default`
- Added mock provider adapter in AI gateway core.
- Worker now registers mock adapter explicitly; mock execution applies only to mock provider path.
- `createWorkflowRun` now supports auto run snapshot creation from server-side `flow_drafts` without manual publish.
- Added stale auto snapshot guard to prevent reusing outdated compiled graphs.
- Workflow compiler node type normalization added:
  - `text -> text.generate`
  - `image -> image.generate`
  - `video -> video.generate`
- Worker image request route fallback:
  - missing route key defaults to `image.default`.
- Generated asset references are written back to node data (`assetId` and related fields) and persisted by remote autosave to `flow_drafts.graph_json`.
- Billing UI ledger display fixed so `refund` is shown as positive amount.

Manual QA:

- `image.default` success path: PASSED
  - `dev:seed-billing` passed
  - `dev:seed-ai` passed
  - draft status was `Saved`
  - generate click worked directly without manual publish
  - auto run snapshot worked
  - worker node execution succeeded
  - UI status `succeeded`
  - `/assets` shows generated image asset and preview
  - `/billing` usage event: `ai.image.generate settled image 10`
  - `/billing` ledger: `reserve -10`, `settle -10`
  - reserved returned to `0`
  - `Ctrl+R` refresh still shows generated result
  - returning from Workspace and reopening project still shows generated result

- `image.fail` / mock failure refund path: PASSED
  - UI currently has no direct `image.fail` route selector
  - test used temporary route config override:
    - `image.default` set to `{"mockMode":"fail","localDevOnly":true}`
    - restored to `{"mockMode":"success","localDevOnly":true}` after test
    - `image.fail` kept as `{"mockMode":"fail","localDevOnly":true}`
  - UI status `failed`
  - worker log: `Mock provider image generation failed intentionally`
  - billing ledger shows reserve/refund pair
  - `billing_accounts`: `balance_cents = 5720`, `reserved_cents = 0`
  - billing UI shows `refund +10`, `reserve -10`
  - failed run does not add settled usage event
  - no `Save failed` or canvas draft save regression observed

Known follow-ups:

- Reserve pricing is still not fully provider/model/route precise in workflow reserve path; default fallback pricing remains in place.
- Frontend still lacks formal model/route selection UI for production-like selection.
- `image.fail` still has no direct UI entry and is currently validated through temporary route config.
- Real providers (OpenAI/Gemini/Replicate/Fal) are intentionally not connected yet.
- Existing legacy migration `npm test` failures remain non-blocking for this sprint.
- Existing Vite chunk size warning remains non-blocking.

## Current Repository

- Local path: `D:\tapnow-flow`
- Remote URL: `https://github.com/AigcLee007/tapflow.git`
- Current branch before Sprint 6: `main`
- Latest main commits:
  - `bd584bb merge sprint-6: account page and legacy cleanup docs`
  - `9b86e66 sprint-6: add account page and cleanup legacy entrypoints`
  - `f88eeda docs: update handoff after sprint 5`
  - `23c7b09 merge sprint-5: billing workflow reserve settle refund`
  - `5169372 sprint-5: add billing workflow reserve settle refund`
  - `9944a4f merge sprint-4: cloud asset library`
  - `a562513 sprint-4: add cloud asset library`
  - `382a9a1 docs: add codex handoff summary`
  - `9fc9ccd merge sprint-3: remote flow draft persistence`
  - `327f8d5 sprint-3: add remote flow draft persistence`
- Current status: clean working tree, `main` is up to date with `origin/main`

## Product Goal

This repository is being refactored into a single authenticated AI Flow workspace product.

- Provide one unified workspace after login.
- Show a TapNow-style project list in `/workspace`.
- Treat each user-facing project as one Flow canvas.
- Persist Flow canvas drafts on the server.
- Add a cloud asset library.
- Add server-side billing, credits, reserve/settle/refund, and ledger records.
- Continue removing legacy product paths and disconnected frontend shells.

## Completed Work

### Sprint 1: Auth Shell and App Routing

Completed:

- `App.tsx` was reduced to `AuthProvider + AppRouter`.
- Added the unified app shell under `src/app/*`.
- Added auth provider, gate, hook, login, and register pages under `src/auth/*`.
- Added centralized v2 clients: `v2HttpClient` and `v2AuthClient`.
- Added `/login` and `/register`.
- Added `AuthGate` for protected app routes.
- Disconnected old primary entries for classic canvas, `/admin`, `/model-mapping`, `/create/flow`, and `/create/classic`.

Key files:

- `App.tsx`
- `src/app/AppRouter.tsx`
- `src/app/WorkspaceShell.tsx`
- `src/app/routes.ts`
- `src/auth/AuthProvider.tsx`
- `src/auth/AuthGate.tsx`
- `src/auth/LoginPage.tsx`
- `src/auth/RegisterPage.tsx`
- `src/auth/useAuth.ts`
- `src/services/v2HttpClient.ts`
- `src/services/v2AuthClient.ts`

### Sprint 2: Workspace Projects

Completed:

- Implemented the `/workspace` page.
- Added TapNow-style project list UI.
- Connected project listing to `GET /api/v2/projects`.
- Connected project creation to `POST /api/v2/projects`.
- After creating a project, the frontend creates a default flow via `POST /api/v2/projects/:projectId/flows`.
- Project cards navigate to `/projects/:projectId`.

Key files:

- `src/app/AppRouter.tsx`
- `src/workspace/WorkspacePage.tsx`
- `src/workspace/WorkspaceHeader.tsx`
- `src/workspace/ProjectTabs.tsx`
- `src/workspace/ProjectToolbar.tsx`
- `src/workspace/ProjectGrid.tsx`
- `src/workspace/ProjectCard.tsx`
- `src/workspace/CreateProjectCard.tsx`
- `src/workspace/useWorkspaceProjects.ts`
- `src/workspace/workspaceApi.ts`

### Sprint 3: Remote Flow Draft Persistence

Completed:

- Added `packages/db/migrations/000010_flow_drafts.sql`.
- Added the `flow_drafts` table with tenant-scoped RLS.
- Added `GET /api/v2/flows/:flowId/draft`.
- Added `PUT /api/v2/flows/:flowId/draft`.
- Added `expectedRevision` conflict handling with `409`.
- Draft autosave stores only `nodes`, `edges`, and `viewport`.
- Backend rejects `data:`, `blob:`, embedded base64 payloads, and local `File`/`Blob`-like objects in `graph_json`.
- `/projects/:projectId` now renders `FlowProjectPage`.
- Remote draft data hydrates into the existing `FlowCanvasPage`.
- `FlowProjectPage` renders `FlowCanvasPage enableLocalPersistence={false}`.
- Added 1200ms debounce autosave for remote drafts.
- `localStorage` and IndexedDB are no longer authority for remote project pages.
- `flow_versions` remains for publish/manual snapshots, not high-frequency autosave.

Key files:

- `packages/db/migrations/000010_flow_drafts.sql`
- `apps/api/src/modules/flows/flows.routes.ts`
- `apps/api/src/modules/flows/flows.schemas.ts`
- `apps/api/src/modules/flows/flows.service.ts`
- `apps/api/test/projects-flows.test.ts`
- `src/app/AppRouter.tsx`
- `src/flowCanvas/FlowProjectPage.tsx`
- `src/flowCanvas/FlowCanvasPage.tsx`
- `src/flowCanvas/hooks/useRemoteFlowProject.ts`
- `src/flowCanvas/hooks/useRemoteFlowAutosave.ts`
- `src/flowCanvas/services/flowProjectApi.ts`

### Sprint 4: Cloud Asset Library

Completed:

- Added `packages/db/migrations/000011_asset_library.sql`.
- Added asset metadata columns: `title`, `description`, `tags`, `source`, `favorite`, and `updated_at`.
- Added `projects.cover_asset_id`.
- Added `asset_folders` and `asset_folder_items`.
- Added or completed `GET /api/v2/assets`.
- Added `PATCH /api/v2/assets/:assetId/metadata`.
- Added asset folder CRUD APIs.
- Kept uploads on the existing `presigned-upload + complete-upload` flow.
- Added the `/assets` cloud asset library page.
- `/assets` uses server APIs and does not use `localStorage`, IndexedDB, Zustand persist, or `assetStorage` as the authoritative data source.
- Added support for inserting assets from the asset library into a project canvas.
- Canvas nodes save structured asset fields including `assetId`, `assetIds`, `mimeType`, `width`, `height`, `durationMs`, `naturalWidth`, `naturalHeight`, and `source`.
- Rendering resolves temporary signed URLs from `assetId`.
- Signed URLs, base64, blob URLs, `File`, and `Blob` payloads are not written into `graph_json`.
- Added `projects.cover_asset_id` support and constrained it with a same-tenant composite foreign key.
- Did not enter Sprint 5 billing work.

Key files:

- `packages/db/migrations/000011_asset_library.sql`
- `apps/api/src/modules/assets/assets.routes.ts`
- `apps/api/src/modules/assets/assets.schemas.ts`
- `apps/api/src/modules/assets/assets.service.ts`
- `apps/api/src/modules/projects/projects.schemas.ts`
- `apps/api/src/modules/projects/projects.service.ts`
- `src/assets/*`
- `src/app/AppRouter.tsx`
- `src/flowCanvas/FlowProjectPage.tsx`
- `src/flowCanvas/nodes/FlowNodes.tsx`
- `src/flowCanvas/types.ts`
- `src/workspace/workspaceApi.ts`

### Sprint 5: Billing + Workflow Reserve/Settle/Refund

Completed:

- The frontend `/billing` page was rebuilt onto the v2 billing APIs.
- `/billing` now uses:
  - `GET /api/v2/billing/summary`
  - `GET /api/v2/billing/usage-events`
  - `GET /api/v2/billing/ledger`
  - `POST /api/v2/billing/redeem`
  - `POST /api/v2/billing/payment/create-checkout`
- Added `packages/db/migrations/000012_billing_redeem_payments.sql`.
- Added `billing_redeem_codes`.
- Added `billing_redeem_code_redemptions`.
- Added `billing_payments`.
- Added `billing_plans`.
- Added `model_pricing`.
- Added `POST /api/v2/billing/redeem`.
- Added `POST /api/v2/billing/payment/create-checkout`.
- Added `POST /api/v2/billing/admin/adjust`.
- Added `GET /api/v2/billing/pricing`.
- Workflow creation reserves credits before enqueueing worker execution.
- The worker settles reserved usage after successful execution.
- The worker refunds or releases reserved usage after failure or cancellation.
- `reserve`, `settle`, `refund`, `redeem`, `payment`, and `admin adjust` are protected by idempotency keys or unique constraints.
- When balance is insufficient, the backend returns `402 INSUFFICIENT_BALANCE` and does not enqueue free execution.
- The frontend only shows a friendly insufficient-balance hint; the backend remains the final enforcement point.
- The new main path no longer uses legacy billing APIs:
  - `/api/account/billing-center`
  - `/api/account/redeem`
  - legacy `accountService` billing calls
- Did not enter Sprint 6 cleanup.

Key files:

- `packages/db/migrations/000012_billing_redeem_payments.sql`
- `packages/db/src/billing.ts`
- `packages/db/src/index.ts`
- `apps/api/src/modules/billing/billing.routes.ts`
- `apps/api/src/modules/billing/billing.schemas.ts`
- `apps/api/src/modules/billing/billing.service.ts`
- `apps/api/src/modules/workflow-runs/workflow-runs.service.ts`
- `apps/worker/src/workflow-runtime/service.ts`
- `src/billing/*`
- `src/app/AppRouter.tsx`
- `src/flowCanvas/canvas/FlowTopToolbar.tsx`
- `src/flowCanvas/runtime/v2WorkflowRunner.ts`
- `src/services/v2WorkflowRunsApi.ts`
- `src/services/v2WorkflowRunsApi.test.ts`

### Sprint 6: Account + Legacy Cleanup + Docs

Completed and merged to `main`:

- `/account` now uses the v2 auth session from `GET /api/v2/auth/me`.
- `/account` shows current user email, display name, tenant/workspace details, roles, permissions, and logout.
- `/account` logout uses `POST /api/v2/auth/logout` through the centralized v2 auth client.
- Normal user-facing routes are limited to `/login`, `/register`, `/workspace`, `/projects/:projectId`, `/assets`, `/billing`, and `/account`.
- `/create/classic`, `/create/flow`, `/admin`, and `/model-mapping` are no longer normal product entry points.
- The root app path does not mount `InfiniteCanvas`, `ControlPanel`, or `MobileView`.
- `FlowCanvasPage` no longer uses local autosave or autoload through `localStorage` or IndexedDB as the authoritative draft flow.
- Remote project canvases still use `flow_drafts` as the authoritative server-side draft store.
- The asset library still uses `/api/v2/assets` as the authoritative data source.
- Billing still uses `/api/v2/billing/*` plus workflow `reserve` / `settle` / `refund` as the primary path.
- The authenticated project canvas no longer depends on legacy `accountIdentity` auth/session helpers.
- The authenticated project canvas no longer uses `imageFolderStore` or `assetStorage` as active new-path dependencies.
- The new main `/account` and `/billing` paths do not use legacy `/api/auth/*`, `/api/account/billing-center`, `/api/account/redeem`, or legacy `accountService` calls.
- `README.md` now documents the current v2 startup flow, route structure, persistence rules, asset model, and billing/workflow model.
- Legacy files were not deleted when they are still useful for migration/debug or have standalone references outside the main product path.
- Sprint 6 was completed on `sprint-6-account-cleanup-docs`, reviewed, merged to `main`, and pushed to `origin/main`.

Key files:

- `App.tsx`
- `src/app/AppRouter.tsx`
- `src/account/AccountPage.tsx`
- `src/app/WorkspaceShell.tsx`
- `src/flowCanvas/FlowCanvasPage.tsx`
- `src/flowCanvas/canvas/FlowLeftAddPanel.tsx`
- `src/flowCanvas/nodes/FlowNodes.tsx`
- `README.md`
- `docs/CODEX_HANDOFF.md`

## Git History

Key commits currently on `main`:

- `8d8512f merge fix: persist derived image nodes as assets`
- `5224eec merge fix: tenant assets isolation and billing qa seed`
- `69d60df merge fix: show project cover images`
- `ef444c7 merge fix: persist asset-backed canvas nodes`
- `bd584bb merge sprint-6: account page and legacy cleanup docs`
- `9b86e66 sprint-6: add account page and cleanup legacy entrypoints`
- `f88eeda docs: update handoff after sprint 5`
- `23c7b09 merge sprint-5: billing workflow reserve settle refund`
- `5169372 sprint-5: add billing workflow reserve settle refund`
- `9944a4f merge sprint-4: cloud asset library`
- `a562513 sprint-4: add cloud asset library`
- `382a9a1 docs: add codex handoff summary`
- `abbd3d9 initial tapflow baseline with auth shell and workspace`
- `327f8d5 sprint-3: add remote flow draft persistence`
- `9fc9ccd merge sprint-3: remote flow draft persistence`

## Known Test Status

- `npm run build` passes, with only the existing Vite chunk size warning.
- `npm run build --workspace @aigc-flow/api` passes.
- `npm run build --workspace @aigc-flow/db` passes.
- `npm run build --workspace @aigc-flow/worker` passes.
- `npx vitest run src/services/v2WorkflowRunsApi.test.ts` passes.
- `npm test` currently fails only in `scripts/migrate-legacy-v2/test/migrate.test.ts`.
- The known failures are legacy migration asset count / storage upload assertions:
  - `dry-run does not write DB or S3`
  - `missing asset files record a warning without crashing the batch`
  - `asset migration writes object content to storage but not to the DB writer payload, and includes tenant scope`
- These failures are recorded as non-blocking for Sprint 1, Sprint 2, Sprint 3, Sprint 4, Sprint 5, and Sprint 6.
- DB integration tests may be skipped locally when no database environment is configured.

## Current QA Status

Status:

TapFlow v2 local core loop: PASSED

Pass date:

2026-05-19

Validated local core flows:

1. Auth
   - Register
   - Login
   - Logout
   - `/account` user profile visibility
2. Workspace
   - `/workspace` project list load
   - Create project
   - Auto-create default flow
   - A/B account project isolation passed
3. Flow Canvas
   - Regular node remote draft save
   - Direct uploaded image node remote draft save
   - `/assets` inserted image node remote draft save
   - Split/slice nodes remain visible after refresh
   - Crop nodes remain visible after refresh
   - Annotation nodes remain visible after refresh
   - Nodes remain visible after returning to `/workspace` and reopening project
   - Edges remain saved and restored
4. Assets
   - `/assets` single image upload
   - `/assets` batch image upload
   - Assets remain after refresh
   - A/B account asset isolation passed
   - Asset preview modal close button remains usable
   - Insert-from-library to canvas passed
   - Set project cover passed
   - `/workspace` project cover remains visible after refresh
5. Billing
   - `/billing` page load
   - Dev seed makes balance/usage/ledger visible
   - Redeem base flow testable

Not yet included in this pass scope:

1. Real AI provider/model/route/credential production configuration.
2. Production-grade end-to-end reserve/settle/refund validation with real generation workloads.
3. Real payment integration.
4. Redeem-code operations backend/admin workflows.
5. The three known legacy migration test failures.
6. Vite chunk-size warning optimization.
7. Production deployment hardening and security controls.

## Important Constraints for Future Codex Sessions

- Do not restore old `InfiniteCanvas` as a primary product entry.
- Do not restore `/create/classic` or `/create/flow` as primary entries.
- Do not use browser `localStorage` or IndexedDB as authoritative Flow canvas storage.
- Do not write base64, `blob:`, `data:`, `File`, or `Blob` payloads into `flow_drafts.graph_json`.
- `flow_versions` is for publish/manual snapshots only, not autosave.
- Every new Sprint must start from a clean `main` and create a new branch.
- Each Sprint should be reviewed before commit, pushed as its own branch, then merged to `main` after review.
- Do not implement multiple Sprints in one pass.

## Next Planned Sprint

### Post-sprint stabilization / manual QA

Planned goals:

- Run the full local user path manually: login, workspace, create project, open project canvas, autosave draft, upload assets, insert assets into the canvas, redeem billing code, and execute the generation billing flow.
- Verify the final `main` path matches the intended v2 product routing and does not regress into legacy account, billing, or canvas entry points.
- Capture any remaining polish, documentation gaps, or manual QA issues as follow-up tasks rather than starting a new sprint blindly.

## Suggested Next User Prompt

Copy this prompt in the next session:

> 请先读取 AGENTS.md、docs/DEVELOPMENT_PLAN.md、docs/CODEX_HANDOFF.md，然后在当前 main 分支上做一次完整本地手工验证：登录、工作空间、新建项目、画布保存、素材上传、素材插入画布、账单兑换、生成扣费链路，并记录结果。
