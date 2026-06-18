# B+ Operations Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the B+ product model: clean creator-facing UI, three product identities, synced user-menu billing state, user-friendly billing usage records, and an independent operations console entry for admin work.

**Architecture:** Keep backend tenant isolation and existing `admin:system` enforcement. Add frontend role helpers for `super_admin`, `admin`, and `creator`, centralize billing summary display data, and convert usage events into creator-readable table rows while retaining technical identifiers only in backend/admin data.

**Tech Stack:** Vite, React, TypeScript, Fastify permissions, `@aigc-flow/db`, Vitest, existing v2 billing/admin APIs.

---

## File Structure

- Create `src/auth/productRoles.ts`: derive product identity from existing roles and permissions.
- Create `src/billing/billingDisplay.ts`: map membership tiers, event types, models, parameters, quantities, credits, and statuses into creator-facing labels.
- Create `src/billing/useBillingSummarySnapshot.ts`: reusable summary loader for the shell menu.
- Modify `src/app/WorkspaceShell.tsx`: hide model connection entry from creators, show balance and membership level, and route admin identities to operations console.
- Modify `src/app/WorkspaceShell.test.tsx`: cover creator menu hiding model settings and admin menu showing operations console.
- Modify `src/app/AppRouter.tsx`: protect admin/account model routes so creators cannot access them directly.
- Modify `src/billing/BillingUsageTable.tsx`: replace technical columns with creator-facing usage columns.
- Modify `src/billing/BillingCenterPage.test.tsx`: assert user-friendly usage table labels.
- Modify `src/admin/AdminPage.tsx`: add operations-console module navigation copy for users, memberships, credit grants, usage audit, model routes, provider connections, and admin accounts.
- Modify `PROJECT_RECORD.md`: record B+ operations console/user-facing billing follow-up.

## Task 1: Product Role Helpers

**Files:**
- Create: `src/auth/productRoles.ts`
- Modify: `src/app/WorkspaceShell.test.tsx`

- [ ] **Step 1: Write role helper tests or shell tests**

Add tests that make creator users not see "连接与模型" and admin users see "运营后台".

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/app/WorkspaceShell.test.tsx`
Expected: FAIL because creator menu still shows model settings and no B+ role helper exists.

- [ ] **Step 3: Implement `resolveProductRole`**

Use roles/permissions:
- `super_admin`: `roles` includes `system_admin` or permissions include `admin:system` and role includes system-level admin.
- `admin`: permissions include `admin:system`.
- `creator`: fallback.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx vitest run src/app/WorkspaceShell.test.tsx`
Expected: PASS.

## Task 2: Shell Menu Billing Snapshot

**Files:**
- Create: `src/billing/useBillingSummarySnapshot.ts`
- Modify: `src/app/WorkspaceShell.tsx`
- Modify: `src/app/WorkspaceShell.test.tsx`

- [ ] **Step 1: Write failing shell menu test**

Mock billing summary to return `availableCredits: 120` and `membership.tier: "gold"`; assert the menu shows `120` and `黄金会员`.

- [ ] **Step 2: Run test and verify RED**

Run: `npx vitest run src/app/WorkspaceShell.test.tsx`
Expected: FAIL because menu uses static `0` and `FREE`.

- [ ] **Step 3: Implement shared snapshot hook and menu rendering**

Load `getBillingSummary()` when authenticated. Show available credits and membership tier labels.

- [ ] **Step 4: Run test and verify GREEN**

Run: `npx vitest run src/app/WorkspaceShell.test.tsx`
Expected: PASS.

## Task 3: Creator-Friendly Billing Usage Table

**Files:**
- Create: `src/billing/billingDisplay.ts`
- Modify: `src/billing/BillingUsageTable.tsx`
- Modify: `src/billing/BillingCenterPage.test.tsx`

- [ ] **Step 1: Write failing billing usage test**

Use one usage fixture with metadata/model fields and assert columns: 时间, 事件, 模型, 参数, 数量, 点数, 状态. Assert technical strings like idempotency key and workflow run id are absent.

- [ ] **Step 2: Run test and verify RED**

Run: `npx vitest run src/billing/BillingCenterPage.test.tsx`
Expected: FAIL because current table shows raw event type and task column.

- [ ] **Step 3: Implement display mapping**

Map:
- `text` -> 文本生成
- `image` -> 图片生成
- `video` -> 视频生成
- `audio` -> 音频生成
- `agent`/agent event -> Agent
- status settled/refunded/pending/failed -> 已结算/已退款/处理中/失败

Read model/parameter labels from metadata when present, fallback to modelId/routeId/`-`.

- [ ] **Step 4: Run test and verify GREEN**

Run: `npx vitest run src/billing/BillingCenterPage.test.tsx`
Expected: PASS.

## Task 4: Route Protection and Operations Console Modules

**Files:**
- Modify: `src/app/AppRouter.tsx`
- Modify: `src/admin/AdminPage.tsx`
- Modify: relevant tests if present.

- [ ] **Step 1: Add route protection**

Creators hitting `/admin`, `/account/ai-settings`, `/account/provider-settings`, `/account/template-library`, or `/account/inspection` should redirect to `/account` or show a no-access page.

- [ ] **Step 2: Add operations console module navigation**

Admin page should present modules: 用户管理, 会员管理, 积分发放, 用量审计, 模型线路管理, 供应商连接管理, 管理员账号管理. Mark model/provider/admin-account modules as super-admin scope in UI copy.

- [ ] **Step 3: Run focused tests**

Run:
- `npx vitest run src/app/WorkspaceShell.test.tsx src/billing/BillingCenterPage.test.tsx`
- `npm run build`

Expected: PASS.

## Task 5: Project Record and Final Validation

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update project record**

Add B+ follow-up entry with verification commands.

- [ ] **Step 2: Run final verification**

Run:
- `npx vitest run src/app/WorkspaceShell.test.tsx src/billing/BillingCenterPage.test.tsx`
- `npm run build`

Expected: PASS.
