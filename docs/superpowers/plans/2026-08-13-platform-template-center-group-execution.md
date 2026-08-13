# Platform Template Center And Group Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a platform-admin template center with published reusable Flow templates and make group execution run only the selected group with confirmation, dependency scheduling, and existing billing guarantees.

**Architecture:** Extend the existing server-backed `flow_templates` path with platform-scoped draft/published versions and an `input_schema`; keep ordinary user insertion as a graph copy into the current project. Add a group execution scope to the v2 workflow-run contract, with the server deriving and validating the group node set from the current draft before creating node runs. Keep the UI in the existing React canvas/admin patterns and keep all media authoritative through asset IDs.

**Tech Stack:** Vite + React, `@xyflow/react`, Zustand flow store, Fastify v2 API, PostgreSQL migrations/RLS, BullMQ worker runtime, existing billing reserve/settle/refund services, Vitest.

---

## File Map

Template data and APIs:

- Modify `packages/db/migrations/000021_canvas_dock_panels.sql` (or add the next migration if already applied): platform template status/version/input fields, indexes, and RLS constraints.
- Modify `apps/api/src/modules/flow-templates/flow-templates.schemas.ts`: admin create/update/publish schemas and input schema validation.
- Modify `apps/api/src/modules/flow-templates/flow-templates.service.ts`: platform-admin CRUD, publish/archive transitions, version snapshots, graph/input validation.
- Modify `apps/api/src/modules/flow-templates/flow-templates.routes.ts`: protected admin routes while preserving ordinary published-template read/usage routes.
- Modify `apps/api/src/app.ts` and `apps/api/src/fastify.d.ts` only if new decorated services or route registration are needed.
- Modify `src/services/v2FlowTemplatesApi.ts`: admin and user client methods plus normalized types.

Template admin UI:

- Create `src/admin/templates/TemplateAdminListPage.tsx`: status/filter/search table and actions.
- Create `src/admin/templates/TemplateAdminEditorPage.tsx`: template metadata, canvas host, input markers, save/test/publish controls.
- Create `src/admin/templates/templateAdminRoutes.tsx` or extend the existing admin route module: permission-gated routes.
- Create `src/admin/templates/templateInputSchema.ts`: shared frontend input schema types and field-path helpers.
- Add focused tests beside each page and helper.

Canvas insertion and group execution:

- Modify `src/flowCanvas/nodes/FlowNodes.tsx`: replace clipboard-only group template action with the template save flow; add group execution confirmation trigger and group status display.
- Modify `src/flowCanvas/canvas/AiFlowCanvas.tsx`: pass template save/test callbacks and refresh template list after publish/use where appropriate.
- Modify `src/flowCanvas/store/flowCanvasStore.ts`: expose selected group graph extraction, group validation, and group run state.
- Create `src/flowCanvas/groupExecution/groupExecutionPlan.ts`: pure graph-scope analysis, external dependency detection, topological layers, and blocking diagnostics.
- Create `src/flowCanvas/groupExecution/GroupExecutionConfirmDialog.tsx`: confirmation UI using shared menu/modal density patterns.
- Modify `src/flowCanvas/runtime/v2WorkflowRunner.ts`: accept `runMode: 'group'` and `groupId`/normalized node IDs, maintain group run state, and preserve target-node behavior.
- Modify `src/services/v2WorkflowRunsApi.ts` and API workflow-run schemas/services: group scope request/response fields and server-side graph derivation.
- Modify `apps/worker/src/workflow-runtime/service.ts`: schedule only validated group nodes, parallelize ready layers, block dependent descendants, and support retry-failed group runs.
- Add focused unit/API/worker tests for planning, authorization, scheduling, and billing idempotency.

Documentation and record:

- Modify `PROJECT_RECORD.md` after implementation and staging validation with the completed product/operational changes.
- Update `docs/CODEX_HANDOFF.md` and relevant admin/local QA docs after the feature is verified.

---

### Task 1: Add Template Lifecycle Data Model

**Files:** migration listed above; `apps/api/src/modules/flow-templates/flow-templates.schemas.ts`; API template tests.

- [ ] **Step 1: Write failing migration/API tests** for `draft`, `testing`, `published`, and `archived` visibility; platform templates must use `tenant_id IS NULL`; ordinary tenant users must not read drafts or archived templates.
- [ ] **Step 2: Run the focused API test** with `npm run test --workspace @aigc-flow/api -- test/flow-templates.test.ts`; confirm the new lifecycle assertions fail against the current read-only API.
- [ ] **Step 3: Add the migration** with `status`, `version`, `input_schema`, `published_at`, `published_by`, immutable version identity, and an index on `(status, category, updated_at DESC)`; add RLS so platform-admin writes are only possible through the server's system-admin context and user reads are limited to `published` official rows.
- [ ] **Step 4: Extend Zod schemas** for template metadata, graph payload, input definitions, save-draft, publish, archive, and list filters. Validate input IDs, supported types (`text`, `asset`, `enum`, `number`), target node IDs/paths, required/default rules, enum values, and numeric ranges.
- [ ] **Step 5: Run migration and focused tests** with `npm run build --workspace @aigc-flow/db` and the API test command; expected result is PASS.
- [ ] **Step 6: Commit** `git add packages/db/migrations apps/api/src/modules/flow-templates apps/api/test/flow-templates.test.ts && git commit -m "feat: add platform template lifecycle"`.

### Task 2: Implement Platform Template Admin API

**Files:** `apps/api/src/modules/flow-templates/flow-templates.service.ts`, `flow-templates.routes.ts`, `apps/api/src/app.ts`, `apps/api/src/fastify.d.ts`, API tests.

- [ ] **Step 1: Write failing service/route tests** for admin create/update draft, transition to testing, publish only after validation, archive, published-only user listing, and forbidden non-admin mutation.
- [ ] **Step 2: Implement service methods** with explicit signatures: `createDraft(ctx, input)`, `updateDraft(ctx, templateId, input)`, `publish(ctx, templateId)`, `archive(ctx, templateId)`, `getAdminTemplate(ctx, templateId)`, and existing `listTemplates/getTemplateGraph/recordUsage` filters updated for status/version.
- [ ] **Step 3: Implement graph normalization/validation**: strip runtime-only selection/dragging fields, reject external edges in a published template, normalize relative positions, count nodes, and reject secret-bearing data or data/blob URLs.
- [ ] **Step 4: Add admin routes** under `/api/v2/admin/flow-templates` using `[requireAuth, requirePermission('admin:system')]`; preserve `/api/v2/flow-templates` for published user reads and `/usage` for insertion records.
- [ ] **Step 5: Run API tests and build**: `npm run test --workspace @aigc-flow/api -- test/flow-templates.test.ts` and `npm run build --workspace @aigc-flow/api`; expected PASS.
- [ ] **Step 6: Commit** `git add apps/api/src/modules/flow-templates apps/api/src/app.ts apps/api/src/fastify.d.ts apps/api/test/flow-templates.test.ts && git commit -m "feat: add platform template admin api"`.

### Task 3: Build Template Admin Client And Screens

**Files:** `src/services/v2FlowTemplatesApi.ts`, new `src/admin/templates/*`, existing admin router/auth gate files, component tests.

- [ ] **Step 1: Write failing UI tests**: non-admin users cannot reach `/admin/templates`; admins can create a draft, edit metadata, see status, save, test, publish, archive, and reopen a template.
- [ ] **Step 2: Add typed client methods** for admin list/get/create/update/test/publish/archive and retain published user list/get/usage methods. Map API errors to existing v2 error presentation.
- [ ] **Step 3: Implement the admin list page** with shared menu/dialog styles, status filters, category/search controls, and row actions. Disable publish/archive actions while requests are pending and show server validation errors inline.
- [ ] **Step 4: Implement the admin editor** by reusing the existing Flow canvas host with a template-management context. Add metadata form, save-draft action, test action, publish/archive actions, and a clear published-version indicator.
- [ ] **Step 5: Add route and permission gates** using the existing product-role/permission helpers; do not expose admin routes in normal creator navigation.
- [ ] **Step 6: Run focused UI tests and `npm run build`; expected PASS. Commit** `feat: add platform template center ui`.

### Task 4: Add Template Input Marking And User Insertion Configuration

**Files:** `src/admin/templates/templateInputSchema.ts`, node editor components in `src/flowCanvas/nodes/FlowNodes.tsx` or the smallest existing field editor boundary, `src/flowCanvas/canvas/AiFlowCanvas.tsx`, `CanvasTemplatePanel.tsx`, `src/flowCanvas/utils/templateGraph.ts`, client/UI tests.

- [ ] **Step 1: Write failing tests** for marking text/asset/enum/number fields, rejecting duplicate IDs/invalid paths, rendering required/default values, and substituting values into a copied graph without changing the source template.
- [ ] **Step 2: Add shared input-schema types and pure field-path utilities**; use asset IDs for media fields and never persist preview URLs as authoritative values.
- [ ] **Step 3: Add “set as template input” controls** next to supported node fields in admin editor context. Persist marker metadata in the draft graph/input schema and show a compact marker state.
- [ ] **Step 4: Add insertion configuration dialog** launched from `CanvasTemplatePanel`; validate required values, use the asset library picker for media, and use shared `MenuSelect` for enums.
- [ ] **Step 5: Apply substitutions server-side or through a validated client payload** while cloning node/edge IDs and offsetting positions; record template ID/version/project usage after successful insertion.
- [ ] **Step 6: Run focused tests and build; commit** `feat: add template inputs and insertion configuration`.

### Task 5: Implement Pure Group Execution Planning

**Files:** create `src/flowCanvas/groupExecution/groupExecutionPlan.ts` and tests; modify `src/flowCanvas/store/flowCanvasStore.ts` only for graph access helpers.

- [ ] **Step 1: Write failing pure tests** covering直属 group children, executable-node filtering, independent parallel layers, internal dependency ordering, missing external results, invalid configuration, cycles, and nested-group blocking.
- [ ] **Step 2: Implement `buildGroupExecutionPlan(nodes, edges, groupId, runtimeOutputs)`** returning `nodeIds`, `layers`, `externalDependencies`, `blockingIssues`, `estimatedCredits`, and `retryableNodeIds`; derive edges from the current graph and ignore group-external execution.
- [ ] **Step 3: Implement deterministic topological layering** with stable node ordering by graph position/ID and explicit cycle diagnostics.
- [ ] **Step 4: Add store selectors/actions** to get the selected group, extract its normalized graph, and cache the latest plan without putting authoritative state in browser persistence.
- [ ] **Step 5: Run `npm run test -- src/flowCanvas/groupExecution/groupExecutionPlan.test.ts src/flowCanvas/store/flowCanvasStore.test.ts`; expected PASS. Commit** `feat: add group execution planning`.

### Task 6: Add Group Execution Confirmation And Runner Contract

**Files:** `GroupExecutionConfirmDialog.tsx`, `FlowNodes.tsx`, `AiFlowCanvas.tsx`, `src/services/v2WorkflowRunsApi.ts`, `src/flowCanvas/runtime/v2WorkflowRunner.ts`, frontend tests.

- [ ] **Step 1: Write failing UI/runner tests** proving every group-run click opens confirmation, cancel creates no run, blocking issues disable start, and start sends a scoped group request only after confirmation.
- [ ] **Step 2: Extend the workflow-run request type** with `runMode: 'group'`, `groupId`, and optional stable plan hash; keep `flow` and `target_node` behavior unchanged.
- [ ] **Step 3: Implement the dialog** showing node count, dependency layers, external input status, estimated credits, balance, and blocking issues. Use existing modal/menu tokens and dismissal hooks.
- [ ] **Step 4: Replace `executeGroup` in `FlowNodes.tsx`** so it builds the plan, opens the dialog, and invokes `runBackendWorkflow({ runMode: 'group', groupId })` only from the dialog's confirm action.
- [ ] **Step 5: Update runner state** for group-level status/progress, stream recovery, error display, and retry-failed action; reserve credits only after confirmation and before run creation.
- [ ] **Step 6: Run focused UI/runner tests and build; commit** `feat: add group execution confirmation`.

### Task 7: Enforce Group Scope In API And Worker

**Files:** workflow-run schemas/service tests and implementation in `apps/api/src/modules/workflow-runs/*`; worker scheduling in `apps/worker/src/workflow-runtime/service.ts`; API/worker tests.

- [ ] **Step 1: Write failing API tests** for group requests deriving the group from the current draft, rejecting foreign/unknown group IDs, rejecting tampered node IDs, enforcing tenant/project permissions, and preserving target-node behavior.
- [ ] **Step 2: Implement server-side group resolution**: load the current draft, find the requested group, include only直属 children, validate no nested groups/cycles, classify external edges, and persist normalized scope in `input_json`.
- [ ] **Step 3: Write failing worker tests** for parallel ready nodes, dependency gating, failed-descendant blocking, independent-branch continuation, and retrying only failed nodes.
- [ ] **Step 4: Implement worker group scheduling** using the persisted normalized scope; never enqueue nodes outside the scope, and expose per-node statuses in run snapshots/events.
- [ ] **Step 5: Integrate billing tests** for per-node reserve/settle/refund, missing pricing fail-closed, insufficient balance before task creation, and idempotent retries.
- [ ] **Step 6: Run backend validation**: `npm test`, `npm run test --workspace @aigc-flow/api`, `npm run test --workspace @aigc-flow/worker`, `npm run build --workspace @aigc-flow/api`, and `npm run build --workspace @aigc-flow/worker`; document any infrastructure-only failures. Commit `feat: enforce scoped group workflow runs`.

### Task 8: End-To-End QA, Documentation, And Project Record

**Files:** `PROJECT_RECORD.md`, `docs/CODEX_HANDOFF.md`, `docs/v2-local-development.md` or relevant QA guide, Playwright/UI smoke tests if present.

- [ ] **Step 1: Add an end-to-end checklist** covering admin create/save/test/publish/archive, ordinary-user list/configure/insert, group confirmation, missing external input blocking, parallel execution, failure retry, and billing ledger outcomes.
- [ ] **Step 2: Run `npm run build` and `npm test`** from the repository root; run the focused API/worker/frontend suites again after the full build.
- [ ] **Step 3: Start local v2 infrastructure and services** using `npm run dev:infra`, `npm run db:migrate`, `npm run dev:api`, `npm run dev:worker`, and `npm run dev`; verify `/health`, admin route protection, template insertion, and group-run UI at the documented local URLs.
- [ ] **Step 4: Update `PROJECT_RECORD.md`** with implementation status, migration number, validation commands, and any staging/deployment follow-up. Update handoff/QA docs with the new admin route and test scenarios.
- [ ] **Step 5: Commit documentation and QA changes** with `docs: record template center and group execution rollout`.

## Self-Review

- The plan covers platform-admin lifecycle, published-only user access, input schemas, independent graph cloning, strict group scope, external dependency blocking, confirmation-before-charge, worker scheduling, billing idempotency, tests, and project-record maintenance.
- No unresolved placeholders or unspecified “handle edge cases” steps remain.
- The workflow-run contract is defined once in Task 6 and enforced server-side in Task 7; target-node and full-flow modes remain backward compatible.
- Task order follows dependencies: schema/API before UI, pure planning before runner, runner contract before worker enforcement, then end-to-end verification.
