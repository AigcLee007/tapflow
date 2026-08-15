# Disable Only Default AI Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let administrators disable a broken default/only AI route and hide its product model from the creator-facing catalog until a route is active again.

**Architecture:** Reuse the existing route status PATCH and model-catalog active-route query. Remove only the frontend default-route disable guard; keep API ownership, authorization, audit, and default-clearing behavior unchanged.

**Tech Stack:** React, TypeScript, Vitest, Fastify service tests, PostgreSQL query service.

---

### Task 1: Add the failing model-center regression test

**Files:**
- Modify: `src/account/ai-settings/AiSettingsPage.test.tsx`
- Test: existing `AiSettingsPage` interaction suite

- [ ] **Step 1: Add a test fixture where the selected route is active and default**

Use the existing test setup and mock route data, keeping `route.status = "active"`, `route.isDefault = true`, and `route.tenantId` set.

- [ ] **Step 2: Assert the status action is available for the default route**

Select the model and route, find the button named `停用线路`, assert it is not disabled, click it, and verify `updateAdminRoute` receives the selected route id with `{ status: "inactive" }`.

- [ ] **Step 3: Run the focused test and verify it fails**

Run: `npm test -- src/account/ai-settings/AiSettingsPage.test.tsx`

Expected: FAIL because the current button is disabled when `isSelectedRouteDefault` is true.

### Task 2: Remove the default-route UI guard

**Files:**
- Modify: `src/account/ai-settings/AiSettingsPage.tsx:1638-1650`

- [ ] **Step 1: Remove only `isSelectedRouteDefault` from the disable condition**

Keep `!canManage`, the in-flight action guard, and the existing route ownership guard. Do not change edit/delete behavior or API payloads.

- [ ] **Step 2: Run the focused frontend test**

Run: `npm test -- src/account/ai-settings/AiSettingsPage.test.tsx`

Expected: PASS, including the new default-route disable test and existing status-toggle tests.

### Task 3: Verify creator-facing model availability behavior

**Files:**
- Inspect/test: `apps/api/src/modules/ai-model-catalog/ai-model-catalog.service.ts`
- Modify only if needed: the matching catalog service test file

- [ ] **Step 1: Run the existing catalog service tests**

Run: `npm test --workspace @aigc-flow/api -- ai-model-catalog`

Expected: PASS with the existing `EXISTS` active-route behavior.

- [ ] **Step 2: Add a focused regression assertion only if coverage is missing**

The assertion must verify that a catalog model with no matching `route.status = 'active'` is not returned; do not add a second availability column or migration.

### Task 4: Validate the complete change

**Files:**
- Update: `PROJECT_RECORD.md` with the meaningful admin-operability improvement and validation status

- [ ] **Step 1: Run relevant tests**

Run: `npm test -- src/account/ai-settings/AiSettingsPage.test.tsx`

Run: `npm test --workspace @aigc-flow/api`

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Update the project record**

Record that admins can disable a sole/default route, the model catalog hides models with no active route, and list the exact validation commands.
