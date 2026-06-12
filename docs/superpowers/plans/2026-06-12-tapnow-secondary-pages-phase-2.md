# TapNow Secondary Pages Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `/assets`, `/billing`, and `/account` into the same TapNow-style authenticated product language introduced in Phase 1.

**Architecture:** Keep all v2 data clients, auth checks, billing reserve/settle/refund semantics, and asset upload behavior unchanged. Redesign only page presentation and empty states, with focused rendering tests for the new page contracts.

**Tech Stack:** Vite, React, Tailwind CSS utilities, lucide-react icons, Vitest, Testing Library.

---

## Scope

Modify:

- `src/assets/AssetLibraryPage.tsx`
- `src/assets/AssetGrid.tsx`
- `src/assets/AssetFolderSidebar.tsx`
- `src/billing/BillingCenterPage.tsx`
- `src/billing/BillingSummaryCards.tsx`
- `src/account/AccountPage.tsx`
- page-level tests for assets, billing, and account
- `PROJECT_RECORD.md`

Do not modify:

- asset API, object storage, or upload service behavior
- billing API, ledger mutation rules, reserve/settle/refund logic
- auth provider/token behavior
- canvas/worker/backend modules

## Target Experience

- `/assets`: creator asset library, light left folder rail, compact header, search/refresh/upload actions, and useful upload-first empty state.
- `/billing`: `价格方案` page with plan cards first, balance and usage details below, existing redeem/recharge/ledger tables kept as secondary operations.
- `/account`: account management detail page aligned with the right account menu, readable profile/workspace cards, and admin/model links grouped as management shortcuts.

## Tasks

- [ ] Add failing rendering tests for TapNow-style `/assets`, `/billing`, and `/account` page contracts.
- [ ] Refresh asset library page shell, sidebar labels, loading copy, and empty state.
- [ ] Refresh billing page into `价格方案` with `Basic`, `Pro`, and `Ultimate` plan cards while keeping existing billing details.
- [ ] Refresh account page copy, card styling, management shortcuts, and logout/refresh actions.
- [ ] Run focused tests until green.
- [ ] Run `npm run build`.
- [ ] Update `PROJECT_RECORD.md` with Phase 2 status and validation.
