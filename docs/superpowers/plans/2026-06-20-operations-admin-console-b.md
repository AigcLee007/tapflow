# Operations Admin Console B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/admin` into a production-oriented operations console for a single-creator SaaS, with clear super-admin/admin/creator identity, user credit visibility, redeem-code records, announcement management, model/provider operation links, and route reliability stats.

**Architecture:** Reuse the existing v2 auth, billing, admin, and AI Gateway APIs. Extend the current admin module with read-focused operational endpoints and a small announcements table, then rebuild the frontend admin page as module tabs backed by those endpoints. Keep creator-facing pages free of tenant IDs, raw route IDs, provider secrets, backend route keys, and low-level task identifiers.

**Tech Stack:** Vite + React + TypeScript, Fastify API in `apps/api`, PostgreSQL migrations in `packages/db/migrations`, existing v2 HTTP client, Vitest, Tailwind classes already used by the app.

---

## File Structure

- Modify: `apps/api/src/modules/admin/admin.schemas.ts`
  - Add validation schemas for admin role updates, redeem-code list filters, announcement CRUD, and AI route stats.
- Modify: `apps/api/src/modules/admin/admin.service.ts`
  - Extend user search/detail rows with last login, credit totals, used credits, next expiry, and usage audit summaries.
  - Add admin account management methods for promoting/demoting tenant role keys.
  - Add redeem-code list and redemption log methods.
  - Add announcement CRUD methods.
  - Add AI route reliability stats from `ai_call_logs`.
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
  - Register new `/api/v2/admin/*` routes behind `admin:system`.
- Modify: `apps/api/test/admin.test.ts`
  - Add database-backed API tests for user ops visibility, redeem-code records, announcement CRUD, route stats, and role promotion.
- Add: `packages/db/migrations/000030_admin_announcements.sql`
  - Create tenant-scoped announcement table with RLS and useful indexes.
- Modify: `src/admin/adminApi.ts`
  - Add frontend types and API helpers for the new admin endpoints.
- Rewrite: `src/admin/AdminPage.tsx`
  - Replace the current mixed page with an operations console: overview, users, admins, credits/redeem codes, announcements, usage audit, model routes, provider connections, system monitor.
- Modify: `src/app/WorkspaceShell.tsx`
  - Show role label clearly in the account dropdown and add a compact model reliability indicator beside the notification bell for admins.
- Modify: `PROJECT_RECORD.md`
  - Record the product/admin-console change and validation outcome.

## Task 1: Backend Tests For Operations Data

**Files:**
- Modify: `apps/api/test/admin.test.ts`

- [ ] **Step 1: Add a failing test for user operational fields**

Add a test that registers an admin and target creator, grants credits with expiry, spends credits through a billing ledger insert or usage event, logs in the creator, and expects `/api/v2/admin/users?query=...` to include:

```ts
expect(user.lastLoginAt).toBeTruthy();
expect(user.memberships[0]).toMatchObject({
  balanceCredits: 300,
  availableCredits: 300,
  usedCredits: 120,
});
expect(user.memberships[0].nextCreditExpiresAt).toBeTruthy();
expect(user.memberships[0].creditGrantCount).toBeGreaterThan(0);
expect(user.memberships[0].usageAudit).toMatchObject({
  settledEvents: expect.any(Number),
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cmd /c npx vitest run apps/api/test/admin.test.ts -t "includes user credit expiry and usage audit fields"`

Expected: FAIL because `lastLoginAt`, `usedCredits`, `nextCreditExpiresAt`, and `usageAudit` are not returned yet.

## Task 2: User And Role Operations API

**Files:**
- Modify: `apps/api/src/modules/admin/admin.schemas.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`

- [ ] **Step 1: Extend schemas**

Add:

```ts
export const adminUpdateUserRoleSchema = z.object({
  roleKey: z.enum(["system_admin", "tenant_admin", "flow_developer"]),
  tenantId: z.string().uuid(),
});
export type AdminUpdateUserRoleInput = z.infer<typeof adminUpdateUserRoleSchema>;
```

- [ ] **Step 2: Extend user rows and membership view**

Include `users.last_login_at` in user queries. Extend membership query with aggregate credit information from `billing_credit_grants`, `billing_ledger`, and `usage_events`:

```sql
COALESCE(credit_stats.original_credits, 0)::text AS total_credit_grants,
COALESCE(credit_stats.remaining_credits, 0)::text AS remaining_grant_credits,
COALESCE(credit_stats.active_grant_count, 0)::text AS active_credit_grant_count,
credit_stats.next_expires_at::text AS next_credit_expires_at,
COALESCE(usage_stats.used_credits, 0)::text AS used_credits,
COALESCE(usage_stats.settled_events, 0)::text AS settled_usage_events
```

- [ ] **Step 3: Add role update service method**

Implement `updateUserRole(context, { targetUserId, tenantId, roleKey })`:

```ts
if (!context.roles.includes("system_admin")) {
  throw new AdminApiError(403, "SUPER_ADMIN_REQUIRED", "只有超级管理员可以调整管理员身份");
}
```

Then update `tenant_memberships.role_key`, audit as `admin.user.update_role`, and return `{ targetUserId, tenantId, roleKey }`.

- [ ] **Step 4: Add route**

Register:

```ts
app.patch("/api/v2/admin/users/:userId/role", { preHandler: adminHandlers }, async ...)
```

- [ ] **Step 5: Run tests**

Run: `cmd /c npx vitest run apps/api/test/admin.test.ts -t "includes user credit expiry and usage audit fields"`

Expected: PASS.

## Task 3: Redeem Code Records API

**Files:**
- Modify: `apps/api/test/admin.test.ts`
- Modify: `apps/api/src/modules/admin/admin.schemas.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`

- [ ] **Step 1: Add failing test**

Create a redeem code, redeem it as a target user, then call:

```txt
GET /api/v2/admin/redeem-codes
GET /api/v2/admin/redeem-codes/:codeId/redemptions
```

Expect the list to include `credits`, `status`, `maxRedemptions`, `redeemedCount`, `createdByEmail`, `createdAt`, `expiresAt`, and the redemption log to include `userEmail`, `userDisplayName`, `createdAt`, and `billingLedgerId`.

- [ ] **Step 2: Verify test fails**

Run: `cmd /c npx vitest run apps/api/test/admin.test.ts -t "lists redeem codes and redemption users"`

Expected: FAIL with 404 for missing route.

- [ ] **Step 3: Implement service methods**

Add `listRedeemCodes(context, { limit })` and `listRedeemCodeRedemptions(context, codeId)` using existing tables:

```sql
FROM billing_redeem_codes
LEFT JOIN users AS created_by_user ON created_by_user.id = billing_redeem_codes.created_by
```

and:

```sql
FROM billing_redeem_code_redemptions
LEFT JOIN users ON users.id = billing_redeem_code_redemptions.user_id
WHERE redeem_code_id = $2::uuid
```

- [ ] **Step 4: Register routes and run test**

Run: `cmd /c npx vitest run apps/api/test/admin.test.ts -t "lists redeem codes and redemption users"`

Expected: PASS.

## Task 4: Announcements API And Migration

**Files:**
- Add: `packages/db/migrations/000030_admin_announcements.sql`
- Modify: `apps/api/test/admin.test.ts`
- Modify: `apps/api/src/modules/admin/admin.schemas.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`

- [ ] **Step 1: Add migration**

Create:

```sql
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  title text NOT NULL,
  body text NOT NULL,
  link_url text,
  image_url text,
  status text NOT NULL DEFAULT 'draft',
  audience text NOT NULL DEFAULT 'all',
  published_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('draft', 'published', 'archived')),
  CHECK (audience IN ('all', 'creator', 'admin'))
);
```

Enable RLS with current-tenant policies and add `(tenant_id, status, created_at DESC)` index.

- [ ] **Step 2: Add failing CRUD test**

POST announcement with title/body/link/image/status, list it, patch it, and assert fields persist.

- [ ] **Step 3: Implement schemas, service, routes**

Routes:

```txt
GET /api/v2/admin/announcements
POST /api/v2/admin/announcements
PATCH /api/v2/admin/announcements/:announcementId
```

- [ ] **Step 4: Run test**

Run: `cmd /c npx vitest run apps/api/test/admin.test.ts -t "manages announcements"`

Expected: PASS.

## Task 5: Route Reliability Stats API

**Files:**
- Modify: `apps/api/test/admin.test.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`

- [ ] **Step 1: Add failing route stats test**

Insert two `ai_call_logs` rows for a route, one succeeded and one failed, then expect:

```ts
expect(stats.summary.totalCalls).toBe(2);
expect(stats.summary.successRate).toBe(50);
expect(stats.routes[0]).toMatchObject({
  routeLabel: "线路一",
  totalCalls: 2,
  successfulCalls: 1,
});
```

- [ ] **Step 2: Implement service method**

Add `getAiRouteStats(context, { windowMinutes = 30 })` querying `ai_call_logs` joined to `ai_routes`, `ai_models`, and `ai_providers`.

- [ ] **Step 3: Register route and run test**

Route:

```txt
GET /api/v2/admin/ai/route-stats?windowMinutes=30
```

Run: `cmd /c npx vitest run apps/api/test/admin.test.ts -t "returns ai route reliability stats"`

Expected: PASS.

## Task 6: Frontend API Helpers

**Files:**
- Modify: `src/admin/adminApi.ts`

- [ ] **Step 1: Add types**

Add `lastLoginAt`, `usedCredits`, `nextCreditExpiresAt`, `creditGrantCount`, `usageAudit`, redeem-code list types, announcement types, route stats types, and role update response types.

- [ ] **Step 2: Add helper functions**

Add:

```ts
updateAdminUserRole()
listAdminRedeemCodes()
listAdminRedeemCodeRedemptions()
listAdminAnnouncements()
createAdminAnnouncement()
updateAdminAnnouncement()
getAdminAiRouteStats()
```

- [ ] **Step 3: Run frontend type check through build later**

The frontend has no isolated admin API unit test today; `npm run build` is the final type check.

## Task 7: Rebuild Admin Page

**Files:**
- Rewrite: `src/admin/AdminPage.tsx`

- [ ] **Step 1: Build tabbed operations layout**

Use module tabs:

```txt
总览
用户管理
管理员账号
积分与兑换码
通知公告
用量审计
模型线路
供应商连接
系统监控
```

Show current identity at top:

```txt
当前身份：超级管理员 / 管理员
超级管理员来源：system_admin 角色
管理员来源：admin:system 权限
```

- [ ] **Step 2: User management view**

Show table columns:

```txt
用户
身份
积分总额
可用积分
已使用
最近到期
最近登录
用量审计
```

Detail panel supports membership tier, credit grant with validity, password reset, and usage audit shortcut.

- [ ] **Step 3: Admin accounts view**

Only super admins can promote/demote. Show role choices:

```txt
创作者 -> flow_developer
管理员 -> tenant_admin
超级管理员 -> system_admin
```

- [ ] **Step 4: Credits/redeem view**

Keep create form, add generated-code result card, list generated redeem codes, and list selected code redemption records.

- [ ] **Step 5: Announcements view**

Add editor for title/body/link/image/status/audience and list existing announcements. Use clear admin copy; do not expose raw JSON.

- [ ] **Step 6: Usage and monitor views**

Usage audit keeps workflow failures but labels them as operational records. System monitor displays route stats with success rate, average latency, success/total, and health state.

- [ ] **Step 7: Model and provider views**

Do not duplicate the full existing model/provider editors. Provide operational cards with deep links to Model Center and Provider Connections plus compact route/connection stats.

## Task 8: Top Bar Identity And Stats

**Files:**
- Modify: `src/app/WorkspaceShell.tsx`

- [ ] **Step 1: Add role label**

Show the role inside the account dropdown:

```txt
身份：超级管理员 / 管理员 / 创作者
```

- [ ] **Step 2: Add admin route stats pill**

For admins only, call `getAdminAiRouteStats({ windowMinutes: 30 })` and show compact status beside the notification bell:

```txt
线路 98% · 1.2s
```

Clicking it navigates to `/admin#monitor`.

## Task 9: Project Record And Verification

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update project record**

Add a dated note covering:

```txt
- Operations console B implemented.
- Admin identity is explicit.
- User credit/expiry/usage/recent login fields are visible.
- Redeem code records and redemption records are visible.
- Announcement management exists.
- Route reliability stats are visible in admin and top bar.
```

- [ ] **Step 2: Run focused API tests**

Run: `cmd /c npx vitest run apps/api/test/admin.test.ts`

Expected: PASS or document database-env skip.

- [ ] **Step 3: Run build**

Run: `cmd /c npm run build`

Expected: PASS.

- [ ] **Step 4: Inspect git diff**

Run: `git status --short` and `git diff --stat`.

- [ ] **Step 5: Commit if requested**

Stage only current-task files and commit:

```bash
git add apps/api/src/modules/admin/admin.schemas.ts apps/api/src/modules/admin/admin.service.ts apps/api/src/modules/admin/admin.routes.ts apps/api/test/admin.test.ts packages/db/migrations/000030_admin_announcements.sql src/admin/adminApi.ts src/admin/AdminPage.tsx src/app/WorkspaceShell.tsx PROJECT_RECORD.md docs/superpowers/plans/2026-06-20-operations-admin-console-b.md
git commit -m "feat: rebuild operations admin console"
```

Push only when the user explicitly asks for GitHub push in this task.
