# Prompt Plaza Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the approved official image-prompt plaza with search, categories, copy, favorites, admin import/publish, prompt detail pages, and new-node canvas reference.

**Architecture:** Add a tenant-aware v2 prompt catalog API and PostgreSQL migration, using catalog-scoped effect assets and existing signed URL/storage patterns. Add React routes for the plaza and detail page, a protected admin panel, and a compact canvas dock panel. A prompt reference carries only an id plus an idempotency request id into the project route; the canvas creates a new image node and saves the prompt snapshot through existing remote draft autosave.

**Tech Stack:** Fastify, Zod, PostgreSQL migrations/RLS, existing S3 storage provider, Vite + React, `@xyflow/react`, existing v2 HTTP client, Vitest/Testing Library.

---

### Task 1: Prompt catalog schema and backend contract

**Files:**
- Create: `packages/db/migrations/000039_prompt_plaza.sql`
- Create: `apps/api/src/modules/prompts/prompts.schemas.ts`
- Create: `apps/api/src/modules/prompts/prompts.service.ts`
- Create: `apps/api/src/modules/prompts/prompts.routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/fastify.d.ts`
- Test: `apps/api/src/modules/prompts/prompts.service.test.ts`
- Test: `apps/api/src/modules/prompts/prompts.schemas.test.ts`

- [ ] Write schema tests for list filters, favorite input, interaction event types, admin draft input, and import row validation.
- [ ] Run the focused schema tests and confirm they fail because the prompt schemas do not exist.
- [ ] Add the migration with global published official catalog rows, catalog media relation, tenant/user favorites, tenant interactions, RLS policies, and indexes. Keep catalog media tied to `assets` ids with the dedicated `prompt_catalog` source rule.
- [ ] Add service methods for list, detail, favorite toggle, interaction logging, admin CRUD, publish/archive, and import validation. Use `withTenantTransaction`, parameterized SQL, current tenant context, and short-lived asset download URLs through the existing storage service boundary.
- [ ] Add routes under `/api/v2/prompts` using `requireAuth`, `requireTenant`, and the existing admin permission middleware for mutations.
- [ ] Register the service and routes in `app.ts` and `fastify.d.ts`.
- [ ] Add service tests for published-only visibility, tenant-isolated favorites, duplicate favorite idempotency, and rejecting unpublished prompt detail access.
- [ ] Run the focused API tests and the workspace API type build.
- [ ] Commit `feat: add prompt plaza catalog api`.

### Task 2: User prompt API client and plaza/detail routes

**Files:**
- Create: `src/services/v2PromptsApi.ts`
- Create: `src/prompts/promptTypes.ts`
- Create: `src/prompts/PromptCard.tsx`
- Create: `src/prompts/PromptFilters.tsx`
- Create: `src/prompts/PromptPlazaPage.tsx`
- Create: `src/prompts/PromptDetailPage.tsx`
- Create: `src/prompts/PromptProjectPicker.tsx`
- Modify: `src/app/routes.ts`
- Modify: `src/app/AppRouter.tsx`
- Modify: `src/app/WorkspaceShell.tsx`
- Test: `src/services/v2PromptsApi.test.ts`
- Test: `src/prompts/PromptCard.test.tsx`
- Test: `src/prompts/PromptPlazaPage.test.tsx`
- Test: `src/prompts/PromptDetailPage.test.tsx`

- [ ] Write failing client and component tests for query serialization, card copy/favorite/reference actions, search/category state, detail rendering, project selection, and clipboard failure feedback.
- [ ] Run the focused tests and confirm the new modules are missing.
- [ ] Implement v2 prompt API types and functions with the existing `apiGet`, `apiPost`, `apiDelete`, and `apiPatch` helpers.
- [ ] Implement the search-first compact grid, official category tabs, favorites view, stable loading/empty/error states, and icon tooltips using the existing menu/button conventions.
- [ ] Implement the full detail route with a 2x2 gallery, fixed prompt panel, copy action, favorite action, and project picker. Use `promptId` plus a generated `promptInsertRequestId` in the project navigation query; do not put prompt text in the URL.
- [ ] Add routes `/prompts` and `/prompts/:promptId`, add the top navigation item, and preserve query state when returning from detail.
- [ ] Run the focused frontend tests and `npm run build`.
- [ ] Commit `feat: add prompt plaza discovery pages`.

### Task 3: Admin prompt management and import UI

**Files:**
- Create: `src/admin/PromptLibraryPanel.tsx`
- Create: `src/admin/promptLibraryApi.ts`
- Modify: `src/admin/AdminPage.tsx`
- Modify: `src/admin/adminApi.ts` only when shared admin types are needed
- Test: `src/admin/PromptLibraryPanel.test.tsx`

- [ ] Write failing tests for draft listing, edit validation, publish/archive actions, effect-media ordering, and import preview errors.
- [ ] Run the focused admin tests and confirm the panel is missing.
- [ ] Implement a permission-protected dense admin panel under the existing `#prompt-library` tab. Support manual title/description/prompt/category/tags editing, draft save, publish/archive, and effect-image ordering using existing object-storage upload helpers where possible.
- [ ] Implement CSV/XLSX import preview and confirmation through the backend validation endpoints. Imported rows remain drafts until explicit publish.
- [ ] Add admin loading, validation, permission, and media failure states.
- [ ] Run focused admin tests and frontend build.
- [ ] Commit `feat: add prompt library admin controls`.

### Task 4: Canvas prompt panel and idempotent new-node reference

**Files:**
- Create: `src/flowCanvas/panels/CanvasPromptPanel.tsx`
- Create: `src/flowCanvas/utils/promptNodeReference.ts`
- Modify: `src/flowCanvas/panels/index.ts`
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.tsx`
- Modify: `src/flowCanvas/types.ts`
- Modify: `src/flowCanvas/FlowProjectPage.tsx` or the project route owner that handles query parameters
- Test: `src/flowCanvas/utils/promptNodeReference.test.ts`
- Test: `src/flowCanvas/panels/CanvasPromptPanel.test.tsx`
- Test: `src/flowCanvas/canvas/AiFlowCanvas.prompt-reference.test.tsx`

- [ ] Write failing tests for prompt-only node data, new-node-per-request behavior, duplicate request suppression on refresh, and copy action behavior in the dock panel.
- [ ] Run the focused tests and confirm the helper/panel behavior is absent.
- [ ] Implement a pure helper that builds a new image node with prompt text, source prompt metadata, default image-node dimensions, and a unique request id. It must never mutate an existing node.
- [ ] Add the compact prompt dock panel with search, category tabs, copy icon, and new-node icon. Reuse current project id and `addNode`/`screenToFlowPosition` APIs.
- [ ] Handle standalone route query parameters in the project page: fetch the prompt, check `promptInsertRequestId` in graph nodes, add once, select/focus it, let existing remote autosave persist it, then remove transient query parameters.
- [ ] Add a `promptReference` metadata shape to `FlowNodeData` and ensure draft sanitizers preserve ids/text but reject URLs or binary data.
- [ ] Run focused canvas tests and the complete frontend test suite.
- [ ] Commit `feat: reference prompt plaza entries from canvas`.

### Task 5: Verification, records, merge, and push

**Files:**
- Modify: `PROJECT_RECORD.md`
- Modify: `docs/CODEX_HANDOFF.md` when implementation status changes

- [ ] Run `npm run build`.
- [ ] Run `npm test` and relevant workspace tests for API, DB, and frontend behavior.
- [ ] Run a local browser smoke covering `/prompts` search, detail, copy, project picker, new-node creation, and canvas panel reference when local infrastructure is available.
- [ ] Inspect `git diff`, staged files, and `git status`; ensure unrelated dirty files are not staged.
- [ ] Merge `codex/prompt-plaza` into `main` locally, rerun verification on the merged result, and push `main` to `origin`.
- [ ] Record the final commit hash and validation results in `PROJECT_RECORD.md`.
