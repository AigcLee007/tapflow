# Recharge Display Aliases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show user-facing Chinese recharge package names and correct the entry-plan bonus breakdown without changing administrator-owned plan data.

**Architecture:** Keep `RechargePlan.name` authoritative for admin and payment processing, but derive a presentation-only label from stable plan keys inside `RechargePanel`. Derive the entry plan's base credits from its stable key and retain a server-name fallback for future plans.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Testing Library.

---

### Task 1: Add presentation aliases and entry-plan bonus behavior

**Files:**
- Modify: `src/billing/RechargePanel.test.tsx`
- Modify: `src/billing/RechargePanel.tsx`
- Modify: `PROJECT_RECORD.md`

- [x] **Step 1: Write the failing test**

Use server-owned English names with stable production keys. Assert the cards show `轻量尝鲜`, `日常创作`, `高频创作`, and `专业创作`, hide the English names, and render `基础 100 + 加赠 20` for a `credits_100` plan returning 120 credits. Add an unknown-key plan assertion that falls back to the server name.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/billing/RechargePanel.test.tsx`

Expected: FAIL because `RechargePanel` still renders `plan.name` and calculates the 9.90 plan as zero base credits.

- [x] **Step 3: Write minimal implementation**

Add a `planKey -> displayName` record, a fallback helper, and an entry-plan base-credit override. Use the display helper only in the rendered card title; keep the original plan object passed to `onSelect`.

- [x] **Step 4: Run focused and billing regression tests**

Run: `npm test -- src/billing/RechargePanel.test.tsx src/billing/BillingCenterPage.test.tsx src/billing/PaymentStatusPanel.test.tsx src/billing/RedeemCodeBox.test.tsx`

Expected: all tests pass.

- [x] **Step 5: Build and record the change**

Run: `npm run build`

Expected: production build passes with only existing non-blocking warnings. Update `PROJECT_RECORD.md`, run `git diff --check`, then commit the scoped files.
