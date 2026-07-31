# Global Redeem Codes and Billing Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make administrator-created redeem codes usable by any authenticated workspace while exposing a clear super-admin recharge-plan and payment management entry with actionable Chinese errors and labels.

**Architecture:** Keep the redeem function's workspace argument for audit records, but remove workspace filtering from code lookup in a new forward-only database migration. Super-admin creation omits `tenantId` by default, while explicit tenant ownership metadata remains supported for compatibility and auditing. The existing protected payment-management API and panel remain the source of truth; only its presentation and tests are extended.

**Tech Stack:** PostgreSQL migrations, TypeScript, Fastify services, React, Vitest, Testing Library.

---

### Task 1: Lock the requested behavior with failing tests

**Files:**
- Modify: `packages/db/test/personal-wallet-migration.test.ts`
- Modify: `src/billing/RedeemCodeBox.test.tsx`
- Modify: `src/admin/PaymentManagementPanel.test.tsx`
- Create: `apps/api/test/admin-redeem-scope.test.ts`

- [x] **Step 1: Assert the follow-up migration removes tenant filtering while retaining audit tenant input.**
- [x] **Step 2: Assert a known redeem error code produces a specific Chinese message and unknown errors retain the generic fallback.**
- [x] **Step 3: Assert the payment panel exposes the Chinese recharge-plan/payment heading and the new-order-only note.**
- [x] **Step 4: Assert a system administrator request without `tenantId` inserts a global redeem code (`NULL` tenant).**
- [x] **Step 5: Run the focused tests and confirm they fail for missing behavior/files.**

### Task 2: Make redeem codes global and preserve audit scope

**Files:**
- Create: `packages/db/migrations/000051_global_redeem_code_scope.sql`
- Modify: `apps/api/src/modules/admin/admin.service.ts`
- Modify: `src/admin/AdminPage.tsx`

- [x] **Step 1: Add a forward-only `wallet_redeem_code` replacement migration using the existing callback-role/ACL pattern; query by `code_hash` only and insert `p_tenant_id` into the redemption audit row.**
- [x] **Step 2: Default omitted `tenantId` to `NULL` for system-admin/admin-email actors, while non-super admins continue defaulting to their current tenant and cannot cross tenant boundaries.**
- [x] **Step 3: Make the super-admin create-code UI omit `tenantId` and explain that codes are site-wide; retain tenant ownership metadata for other admins without using it as a redemption filter.**
- [x] **Step 4: Run the migration and admin scope tests and confirm they pass.**

### Task 3: Surface actionable redeem failures

**Files:**
- Modify: `src/billing/RedeemCodeBox.tsx`
- Modify: `src/billing/RedeemCodeBox.test.tsx`

- [x] **Step 1: Map `REDEEM_CODE_NOT_FOUND`, `REDEEM_CODE_INACTIVE`, `REDEEM_CODE_EXPIRED`, `REDEEM_CODE_EXHAUSTED`, and `REDEEM_CODE_ALREADY_REDEEMED` to concise Chinese messages.**
- [x] **Step 2: Read only the structured error code in the catch path and keep unknown/server-detail text behind the generic fallback.**
- [x] **Step 3: Run the component test and confirm both known and unknown error cases pass.**

### Task 4: Clarify the super-admin recharge and payment surface

**Files:**
- Modify: `src/admin/AdminPage.tsx`
- Modify: `src/admin/PaymentManagementPanel.tsx`
- Modify: `src/admin/PaymentManagementPanel.test.tsx`

- [x] **Step 1: Rename the protected tab and panel to `充值套餐与支付`.**
- [x] **Step 2: Keep editing name, amount, credits, validity, sort order, and active state, and add a visible note that edits affect new orders only.**
- [x] **Step 3: Localize plan/payment labels and actions without changing the existing API or refund eligibility rules.**
- [x] **Step 4: Run the payment panel tests.**

### Task 5: Verify the branch and record the change

**Files:**
- Modify: `PROJECT_RECORD.md`

- [x] **Step 1: Run the focused frontend, API, and database tests.**
- [x] **Step 2: Run `npm run build`.**
- [x] **Step 3: Update `PROJECT_RECORD.md` with the global redeem-code behavior, admin entry, and validation results.**
- [x] **Step 4: Review `git diff` and confirm only task files are changed; leave the pre-existing untracked `output/` untouched.**
