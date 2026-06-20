# Admin Console Interaction Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the operations console interaction loop for route monitoring, redeem-code history/copying, and announcements in the user shell.

**Architecture:** Keep the existing admin module and workspace shell. Extend admin API responses with safe operational fields, add a user-facing announcement feed endpoint, and make the frontend consume those APIs with small hover/menu panels.

**Tech Stack:** Fastify, Zod, PostgreSQL migrations/RLS, Vite React, lucide-react, existing v2 HTTP client/menu components.

---

### Task 1: Backend Contract Tests

**Files:**
- Modify: `apps/api/test/admin.test.ts`

- [ ] **Step 1: Write failing tests**

Add assertions to the redeem-code test that `GET /api/v2/admin/redeem-codes` returns the historical cleartext `code`.

Add announcement assertions that published announcements can be pinned, listed for the current user via `GET /api/v2/announcements`, then deleted from admin management.

- [ ] **Step 2: Run targeted tests to verify red**

Run: `cmd /c npx vitest run apps/api/test/admin.test.ts -t "lists redeem codes|manages announcements"`

Expected in a DB-enabled environment: fail because `code`, `pinned`, public listing, or delete support is missing. In this local environment without `DATABASE_URL`, tests may skip; continue with implementation and rely on build plus skipped status reporting.

### Task 2: Backend Data/API

**Files:**
- Modify: `packages/db/migrations/000030_admin_announcements.sql`
- Modify: `apps/api/src/modules/admin/admin.schemas.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`

- [ ] **Step 1: Extend announcement schema**

Add `pinned boolean NOT NULL DEFAULT false` to the existing migration, plus an ordering index on `(tenant_id, status, pinned DESC, published_at DESC, created_at DESC)`.

- [ ] **Step 2: Return historical redeem codes**

Select `billing_redeem_codes.code` in `listRedeemCodes`, add it to `AdminRedeemCodeView`, and map it to frontend JSON.

- [ ] **Step 3: Add announcement pin/delete/feed**

Allow create/update schemas to accept `pinned`. Update admin list ordering to put pinned notices first. Add `deleteAnnouncement` service and `DELETE /api/v2/admin/announcements/:announcementId`. Add user-facing `GET /api/v2/announcements` with auth+tenant only, returning published, active-window notices for `all` plus the user's creator/admin audience.

### Task 3: Frontend API Types

**Files:**
- Modify: `src/admin/adminApi.ts`

- [ ] **Step 1: Add fields and methods**

Add `code` to `AdminRedeemCode`, `pinned` to `AdminAnnouncement`, `listPublishedAnnouncements`, and `deleteAdminAnnouncement`.

### Task 4: Admin Page Interactions

**Files:**
- Modify: `src/admin/AdminPage.tsx`

- [ ] **Step 1: Add copy helper**

Use `navigator.clipboard.writeText` when available, set the existing message state to confirm copied code.

- [ ] **Step 2: Show historical code**

Render each redeem-code card with the actual `code`, a copy icon button, credits/status/redemption count, and redemption user/time details.

- [ ] **Step 3: Add announcement operations**

Add form pinned toggle. Add actions per announcement: publish/unpublish by status, pin/unpin, delete. Keep archive as non-destructive fallback only if needed.

### Task 5: Workspace Shell Panels

**Files:**
- Modify: `src/app/WorkspaceShell.tsx`

- [ ] **Step 1: Route monitor hover panel**

Replace the current plain route monitor button with a compact icon+text pill and hover/focus panel. Panel lists recent 30-minute route rows with success bars, success/total, average latency, and a click through to `/admin#monitor`.

- [ ] **Step 2: Announcement bell panel**

Fetch `GET /api/v2/announcements?limit=10`, show unread indicator when there are published announcements, and open a bell panel with title/body/image/link/date. Clicking admin-visible manage action goes to `/admin#announcements`.

### Task 6: Verification and Push

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update project record**

Add a concise entry for route monitor hover, redeem history/copy, and announcement feed/management fixes.

- [ ] **Step 2: Verify**

Run:
`cmd /c npx vitest run apps/api/test/admin.test.ts`
`cmd /c npm run build --workspace @aigc-flow/api`
`cmd /c npm run build`

- [ ] **Step 3: Commit and push**

Stage only files touched by this fix, commit with `fix: complete admin console interactions`, push `main`.
