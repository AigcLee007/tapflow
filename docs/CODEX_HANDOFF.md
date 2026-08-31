# Codex Handoff

## Canvas Agent V4 Continuation (2026-08-31)

- V4 delivery now commits verified `assetId` references through tenant-scoped canvas CAS and stores inverse operations for undo; stale revisions remain fail-closed.
- Worker terminal projection merges independent item updates by stable `itemId`, preserving successful siblings and page metadata.
- V4 frontend panel now supports authenticated prompt submission, approval, cancellation, per-item retry, result listing, and undo entry points.
- Golden acceptance fixture now defines all eight required scenarios. V4 flags remain disabled until authenticated staging execution proves the full real-provider, billing, S3, replay, CAS, retry, and rollback flow.

## Canvas Skill Workbench UI Handoff (2026-08-21)

- The Canvas Agent now exposes a persistent Skill bar and picker, including truthful unavailable state while `VITE_AGENT_SKILLS_ENABLED` or server Skill runtime flags are off.
- Product-safe Skill contracts normalize picker and Skill Run responses. Internal provider, route, credential, base URL, and normalized configuration fields are dropped before data reaches UI state.
- V2 `skill.run` approval events resolve the durable Skill Run projection and render an execution plan with estimate, step status, approval, cancellation, and error states. Approval uses the existing session approval stream; cancellation uses the authenticated Skill Run endpoint.
- Replay metadata restores only selected Skill ID/version. The standard chat, history, logs, reference chips, and canvas-first layout remain available.
- Focused frontend validation passed: 30 Skill/API/picker/panel/plan tests, 35 session/panel regression tests, production build, and `git diff --check`. All V2/Skill flags remain disabled pending staging acceptance.

## Agent + Skill Runtime Hardening (2026-08-20)

- Scoped V2 context projects only tenant/flow-safe model catalog, active pricing, and recent run summaries; missing pricing is represented as unavailable rather than free.
- V2 turn events remain redacted and now persist server-side observability metadata (Skill version, duration, first-event latency, retry/redaction counters).
- Persisted Skill actions have explicit runtime mapping for canvas, text, image, and video execution; the text runner uses existing billing reserve/settle/refund and writes authoritative text nodes.
- “查看运行” retains the selected workflow run ID when opening the Agent logs view.
- API/root builds, focused Agent/Skill tests, and diff checks pass. Real authenticated staging E2E remains pending; keep all V2/Skill flags disabled until that gate passes.

## Agent + Skill UI Handoff (2026-08-20)

- The existing Canvas Agent panel now contains a feature-flagged Skill workspace with official/private browsing, search, text/image/video filters, card selection, detail editing, and conversational authoring.
- Skill draft reads/writes go through `/api/v2/agent/skills/*`; private saves use the server revision as CAS input. Official detail reads return only the published creator-facing source. Authoring has no canvas or billing side effects and creates a private draft only after explicit save.
- Completed/reviewable Skill runs can write text or `assetId`-backed media results to the bound canvas through `/api/v2/agent/skill-runs/:runId/place-results`; the endpoint enforces session/turn/flow ownership and strict graph-revision CAS.
- Focused UI tests: 4 passed across picker, authoring, and detail. Frontend production build passed. V2/Skill and authoring flags remain disabled by default until staging acceptance.

## Current Sprint Handoff (platform-template-center)

Branch:

- `codex/platform-template-center`

Implemented:

- Platform administrators manage official templates at `/admin/templates`; regular users can browse published versions and insert configured graph copies.
- Template lifecycle preserves immutable published versions, requires server validation before publication, validates input substitution and tenant-owned assets, and records usage idempotently.
- Group execution always requires a confirmation dialog. The backend derives the direct-child scope from the saved draft, snapshots valid external outputs, schedules independent roots in parallel, delays dependent charges until eligible, and blocks only descendants of failed nodes.

Validation status:

- Frontend template/group focused suite: `109` passed.
- Workflow-core compiler suite: `11` passed.
- API and Worker TypeScript builds: passed.
- Database-backed API/Worker group tests are present but skipped locally because `DATABASE_URL` is absent and Docker Desktop is not running. Before staging, start `npm run dev:infra`, set `DATABASE_URL`, run migrations, then run the API and Worker workspace suites.

## Current Sprint Handoff (provider-settings-admin-ui)

Branch:

- `provider-settings-admin-ui`

Scope:

- Added a minimal local/dev provider settings UI for OpenAI-compatible route management.
- No real payment integration changes.
- No new external provider integrations (Gemini/Replicate/Fal) in this sprint.

Implemented:

- New frontend page: `/account/provider-settings`
  - lists image routes with provider/model/status context
  - supports updating `image.openai` route fields:
    - `baseUrlOverride`
    - `modelId` binding
    - `requestConfig.timeoutMs`
    - `status`
  - supports pricing upsert for `model_pricing` (`image_generation`):
    - `min_charge_credits`
  - supports credential rotation with write-only key input
    - key is sent to rotate endpoint and never re-shown as plaintext
- New frontend API client for admin ai settings:
  - `src/services/v2AiGatewayAdminApi.ts`
- Backend API additions:
  - `GET /api/v2/admin/ai/pricing?unit=...`
  - `PATCH /api/v2/admin/ai/pricing`
- Backend admin permission guard for AI admin endpoints:
  - always requires `requireAuth` + `requireTenant`
  - always enforces permission checks (`provider:*` / `credential:manage`)
  - no dev-mode permission bypass for viewer/basic users

Security model:

- API key material remains server-side only via `CredentialVault`.
- No plaintext key returned by API responses.
- No `encrypted_secret`/`nonce`/`auth_tag` exposed in UI API responses.
- No key material stored in node data or draft graph payloads.

Manual QA:

- Provider Settings UI load/save path: PASSED
  - `/account/provider-settings` opens successfully
  - `GET /api/v2/admin/ai/pricing?unit=image_generation` returns `200`
  - `image.openai` is visible and editable
- `image.openai` settings update affects runtime pricing: PASSED
  - updated pricing from `100` to `200`
  - subsequent run billed at `reserve -200` and `settle -200`
  - `Reserved` returns to `0`
  - usage event shows settled `ai.image.generate 200`
- `image.openai` generation after settings save: PASSED
  - generation succeeds after route/pricing save
  - generated output remains after workspace/project refresh
  - generated output remains visible in `/assets` after refresh
- Credential masked display: PASSED
  - masked value visible (example: `sk-****3e97`)
  - no plaintext key shown in UI or API response
  - credential rotation was intentionally not performed with real key in this pass (safety note / follow-up)

Notes:

- Real payment integration remains out of scope (not connected).

## Current Sprint Handoff (real-provider-openai-image)

Branch:

- `real-provider-openai-image`

Implemented:

- Added minimal real OpenAI-compatible provider support for image generation in `ai-gateway-core`.
- Worker `AiGateway` now registers:
  - `openai` -> `OpenAiCompatibleTextAdapter` (alias)
  - `openai-compatible` -> `OpenAiCompatibleTextAdapter`
  - `mock` -> `MockProviderAdapter` (existing behavior unchanged)
- OpenAI-compatible image calls are server/worker-side only and still flow through:
  - route-aware pricing
  - reserve
  - worker execute
  - media asset store persistence
  - assetId writeback
  - settle/refund
- Added optional local seed path in `dev:seed-ai`:
  - supports `OPENAI_API_KEY` env or `--openai-api-key`
  - supports `OPENAI_COMPAT_BASE_URL` / `OPENAI_BASE_URL` env or `--openai-base-url`
  - supports `--openai-image-model` (default `gpt-image-1`)
  - seeds `openai-compatible / <model> / image.openai` and matching pricing row
  - stores credential using server-side `CredentialVault` encryption only.

Tests:

- Extended `packages/ai-gateway-core/test/runtime.test.ts` for OpenAI-compatible image:
  - successful b64_json response parsing
  - auth failure mapping
  - rate-limit mapping
  - bad-request mapping
  - timeout mapping
  - malformed-response mapping

Status:

- Implementation complete and ready for manual QA.
- Real payment integration remains out of scope.
- OpenAI-compatible timeout refund path: PASSED (reserve/refund behavior correct under timeout).
- OpenAI-compatible success path was blocked by 10s timeout in relay calls; image timeout config updated for retest (`request_config.timeoutMs` + env/provider fallback chain).
- OpenAI-compatible image success path: PASSED.
  - Relay base URL: `https://sub.siphonlab.cn/v1`
  - Model: `gpt-image-2`
  - Route: `image.openai`
  - Node save status returns to `Saved`; generated result persists after refresh/reopen.
  - `/assets` keeps generated asset after refresh.
  - Billing success path: `reserve 100`, `settle 100`, `Reserved -> 0`, usage event includes settled `ai.image.generate 100`.
  - SQL exact pricing match (`node_runs.cost_json` and `billing_ledger.metadata`):
    - `pricingMatch.provider = openai-compatible`
    - `pricingMatch.model = gpt-image-2`
    - `pricingMatch.route = image.openai`
    - `pricingMatch.unit = image_generation`
    - `pricingFallbackLevel = 1`
    - `estimatedCredits = 100`
    - `reservedCredits = 100`
  - Timeout failure path remains PASSED: provider timeout -> `reserve 100` + `refund 100`, `Reserved -> 0`, no new settled usage event.

## Current Sprint Handoff (model-route-selection-ui)

Branch:

- `model-route-selection-ui`

Implemented:

- Added minimal image node route selection UI backed by runtime route metadata.
- Added authenticated read-only route list API for UI route/model display:
  - `GET /api/v2/ai/routes?modality=image`
  - returns safe fields only (`routeKey`, `modality`, provider/model display metadata).
  - does not return credential secret/encrypted payload/raw API key.
- Image node route selector now supports direct selection of:
  - `image.default`
  - `image.fail`
- Node route selection persists as `node.data.routeKey` and is saved via existing remote autosave into server-side `flow_drafts.graph_json`.
- Added node factory defaults for generation routes:
  - image -> `image.default`
  - video -> `video.default`
  - text -> `text.default`
- Existing route-aware pricing path is preserved and consumes selected `routeKey` during reserve estimation.

Manual QA:

- `image.default` success path: PASSED
  - `dev:seed-billing` passed
  - `dev:seed-ai` passed
  - image node route selector supports direct `image.default` selection
  - workflow run succeeded
  - `/assets` contains generated asset and preview is available
  - billing shows `reserve` + `settle`
  - pricing metadata for reserve matches selected route
  - refresh/reopen keeps node route selection and generated result
- `image.fail` refund path: PASSED
  - image node route selector supports direct `image.fail` selection (no temporary DB toggle required)
  - workflow run failed with mock intentional failure
  - billing shows `reserve` + `refund`
  - `Reserved` returns to `0`
  - no new settled usage event on failed run

Manual QA - model-route-selection-ui: PASSED

Validated:

- Route selector shows both `image.default` and `image.fail`.
- `image.default` success path: PASSED.
- `image.fail` refund path: PASSED.
- `image.fail` no longer needs temporary DB toggle.
- `image.fail` single-node project check:
  - UI status `failed`
  - worker log: `Mock provider image generation failed intentionally`
  - Billing ledger includes `reserve -10`
  - Billing ledger includes `refund +10`
  - Reserved returns to `0`
  - Usage Events has no new settled record

Known follow-ups:

- UI currently focuses on image route selection; text/video selector surfaces can be expanded in a later sprint.
- Real provider integrations remain out of scope.
- Real payment integrations remain out of scope.
- Legacy migration 3 failing tests remain known non-blocking.

## Current Sprint Handoff (pricing-route-model-match)

Branch:

- `pricing-route-model-match`

Implemented:

- Workflow run reserve pricing is now matched per runnable node using provider/model/route/unit metadata.
- Added pricing fallback order:
  1. `provider + model + route + unit`
  2. `provider + model + default + unit`
  3. `provider + default + default + unit`
  4. `default + default + default + unit`
- Route runtime context is resolved from active tenant/system `ai_routes` (tenant route has priority over system route for the same key).
- Reserve now stores pricing match metadata in node cost and ledger metadata (`provider`, `model`, `route`, `unit`, fallback level).
- Run creation now rejects unroutable priced generation nodes with `PRICING_NOT_FOUND` and does not enqueue worker jobs.
- Added API integration tests for:
  - exact route/provider/model pricing hit
  - provider fallback hit
  - missing pricing rejection

Manual QA - provider/model/route pricing match: PASSED

Validated:

- UI succeeded and returned to `Saved`.
- Latest `node_runs.cost_json` hit exact pricing:
  - `pricingMatch.provider = mock-local-dev`
  - `pricingMatch.model = mock-image-v1`
  - `pricingMatch.route = image.default`
  - `pricingMatch.unit = image_generation`
  - `pricingFallbackLevel = 1`
  - `estimatedCredits = 10`
  - `reservedCredits = 10`
- Latest reserve row in `billing_ledger.metadata` matches `node_runs.cost_json`:
  - `pricingMatch.provider = mock-local-dev`
  - `pricingMatch.model = mock-image-v1`
  - `pricingMatch.route = image.default`
  - `pricingMatch.unit = image_generation`
  - `pricingFallbackLevel = 1`
- Earlier `default/default/default` entries were from pre-fix runs; latest runs now match exact pricing rows.

Known follow-ups:

- Frontend still has no formal model/route selector.
- `image.fail` remains a backend/local QA route (UI has no direct selector yet).
- Real providers and real payment integrations remain out of scope.
- Legacy migration 3 failing tests remain known non-blocking.

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

Agent + Skill runtime continuation (2026-08-20):

- API and Worker builds pass after wiring normalized Skill versions, durable Skill Run session/turn linkage, V2 approval/cancel compatibility routes, workflow-to-Skill terminal state propagation, delivery checks, and graph-template instantiation.
- Focused tests pass for Skill policy/run/step execution, V2 workflow adapter, delivery checks, graph instantiation, Worker workflow runtime, and frontend Canvas Agent API contracts.
- Skill and Skill Run repositories are created lazily, keeping disabled V2/Skill flags compatible with application tests and utility startup paths that do not provide `DATABASE_URL`.
- The Skill catalog now binds simultaneous modality and text-search filters to stable SQL parameters, and the Canvas Agent session renders V2 `canvas.await_results` waiting/completed activity states.
- Production remains feature-flagged off for V2 Agent and Skill runtime. Staging still needs authenticated end-to-end validation with database, Redis, object storage, billing, and real provider routes before enabling the flags.
- Task 15 rollout documentation is now captured in `docs/v2-local-development.md`, `docs/staging-runbook.md`, and `docs/PRODUCTION_RUNBOOK.md`. The staging environment template already lists the disabled-by-default server/Vite flags and baseline rollback notes.
- Coexistence contract: turns persist `agent_version`, legacy sessions are not force-migrated, and V2/legacy execution is lease-exclusive. Rollback disables V2 runtime first, then Skill runtime/authoring/catalog; durable Skill/version/run/event, asset, draft, and billing-ledger records are preserved.
- Staging acceptance remains pending; no production or staging enablement was performed in this handoff.

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

## Production Readiness Update (2026-05-20)

Branch:

- `production-readiness`

P0 scope executed:

- Tightened ai-gateway request validation (schema-level only, no architecture change):
  - `modality` enum: `text | image | video`
  - `unit` enum: `text_generation | image_generation | video_generation`
  - `status` enum: `active | inactive`
  - `routeKey` format validation tightened
  - `baseUrlOverride` remains limited to `http/https`
  - `timeoutMs` remains bounded in service validation: `1000..300000`
  - `minChargeCredits` / `unitCredits` remain positive integer with upper bound
  - invalid request payloads return `400` via zod route validation path

Production launch posture:

- Real payment is not integrated.
- If launching before payment, product must operate as internal/manual-credit beta.
- Public paid production launch is not allowed in this state.

Security posture (P0 declaration):

- No real API keys are committed.
- Provider credentials are server-side only via CredentialVault.
- Frontend must not receive credential material (`encrypted_secret`, `nonce`, `auth_tag`, raw key).

New production docs added:

- `docs/PRODUCTION_READINESS.md`
- `docs/PRODUCTION_DEPLOYMENT.md`
- `docs/PRODUCTION_RUNBOOK.md`

## 2026-08-03 - PixelHub Video Models Implementation And Local QA

- added the three catalog products and stable routes: `video.pixelhub.gemini-omni-flash`, `video.pixelhub.sora-v3-pro`, and `video.pixelhub.veo31-fast`. They use the `pixelhub-video` adapter, exact `duration_second` billing, 12-second polling, and a 30-minute provider task deadline.
- declared the approved prices: Gemini 1 credit/second, Sora 10 credits/second, Veo 0.5 credits/second. Creator catalog filtering rejects unconfirmed, non-video-generation, and non-exact-priced routes.
- enforced reference semantics at both canvas and gateway boundaries: Gemini all-reference is `reference_image` assets plus exactly one `source_video`; Veo image-to-video is one `first_frame`; Veo first/last mode is two ordered images.
- fixed the remaining Veo transition bug in `VideoReferenceStrip`: removing a first/last-frame reference now re-resolves the mode and roles, so a single remaining image is retained as the valid `first_frame` image-to-video input.
- refreshed the browser smoke fixture for the exact-priced route contract. It now selects a route, verifies one output is enabled while 2/4 are disabled, uses the current parameter-summary trigger, and passed desktop, narrow, and mobile visual checks.
- local evidence: PixelHub focused tests 58 passed; `npm run smoke:video-node` passed; `npm run build` passed. The root `npm test` rerun still fails in known unrelated legacy migration, asset presigning, Canvas Agent, and multipart test groups.
- complete package evidence: AI Gateway Core `141` passed; API `283` passed with `126` database-backed skips; Worker `70` passed with `17` skips; Redis `5` passed with `2` skips; the complete video/canvas focused suite passed `180` assertions. The AI Gateway Core, Redis, API, Worker, and root frontend builds passed.
- authenticated local canvas QA remains unavailable: `npm run dev:infra` failed because the Docker Desktop Linux engine pipe is missing, and this workspace has no `DATABASE_URL` or `REDIS_URL`. The local browser smoke used its isolated catalog harness; it did not call a live API.
- no live PixelHub API call or staging action was performed. The plugin is not installed in staging and inactive/active route smokes remain pending; follow `docs/PIXELHUB_VIDEO_MODELS_RUNBOOK.md`.
## Agent + Skill V2 Safety Verification (2026-08-20)

- V2 native `ask_user` now ends a turn in `waiting_for_input` via `turn_waiting`; it no longer emits a misleading completion event.
- Live and replay consumers share a reducer that redacts V2 tool results before browser state. Only bounded product-safe fields are retained; credentials, provider/route internals, URLs, signed URLs, and binary/data payloads are excluded.
- Regression and focused validation passed: frontend Agent/Skill 40 tests, API 26 tests, Worker 3 tests, AI Gateway Core 175 tests, DB metadata 1 test, plus fresh frontend/API/Worker/Gateway/DB builds and `git diff --check`.
- Production flags remain disabled. Authenticated staging acceptance, real provider/billing/object-storage execution, and the full historical test suite remain follow-up work; known legacy syntax failures are documented above.

Latest contract follow-up (2026-08-20): `SkillStepRunner` now covers normalized action mapping, priced media execution, stable per-step billing idempotency, provider-failure refunds, asset-ID-only write-back, and partial batch outcomes. Focused API Agent/Skill coverage is 35 tests across 9 files; frontend Skill integration/state coverage is 3 tests across 2 files. These tests do not replace staging acceptance with live infrastructure and provider routes.
## Agent + Skill Runtime Continuation (2026-08-21)

### Approval gate continuation

- The V2 `canvas.run_nodes` boundary now persists a product-safe approval plan for paid or batch Skill targets and returns `waiting_for_approval` without creating Workflow Runs or entering billing.
- Approval is session/project/flow scoped and graph-revision checked. A database claim plus `skill-approval:<skillRunId>` idempotency prefix protects approved launches from duplicate Workflow Runs, and returned run IDs are written to the planned Skill steps.
- Focused API approval tests and the API build pass. This is still a release-boundary implementation: `AGENT_V2_RUNTIME_ENABLED` and `AGENT_SKILL_RUNTIME_ENABLED` remain false pending pricing resolution, normalized-step dispatch, Worker delivery-check integration, and real staging acceptance.

- Added `npm run dev:seed-agent-skills`, guarded to local development or explicit `DEV_SEED_ENABLED=true`. The seed contains seven provider-agnostic official text/image/video Skills, uses stable slug/checksum idempotency, writes platform-scoped records, and never updates private Skills.
- Skill draft/publish persistence now keeps source JSON, canonical `SKILL.md`, parsed frontmatter, normalized projection, checksum, and graph data together. Publish supports revision CAS and rejects stale drafts.
- V2 Skill turns now require the Skill runtime flags when a Skill is selected and enforce both flow and project binding against the session.
- Focused validation passed: API Agent/Skill 60 tests, frontend Agent/Skill 49 tests, Worker Skill 42 tests with 18 database-dependent skips, AI Gateway streaming 5 tests, root production build, API build, Worker build, and `git diff --check`.
- Full `npm test` completed with 380 passing, 22 skipped, 32 failing across 15 files and 4 unhandled legacy runtime errors. These remain historical migration, billing/UI fixture, Canvas Agent test-id, production-studio, video-reference, and multipart transport failures. Real authenticated staging acceptance with PostgreSQL, Redis/BullMQ, S3, provider routes, billing, and browser replay is still pending; all Agent/Skill flags remain disabled.
- Pre-merge review fixed the legacy `agent_turns` status-constraint replacement and system-admin RLS context for official Skill seeding. Focused migration and seed regression tests pass.
- Do not enable V2/Skill flags yet: the selected-Skill V2 launch path still needs approval-gate enforcement, normalized Skill-step dispatch, and runtime delivery-check integration before staging acceptance.
