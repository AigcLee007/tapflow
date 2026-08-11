# Asset Library Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution selected for this task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display each asset media category through stable, server-filtered pages of 30 assets and let a user navigate those pages.

**Architecture:** Keep the existing `/api/v2/assets` offset-pagination API. The hook sends `kind` for a concrete media tab, owns the current page and derived page count, and resets page state whenever a query-defining filter changes. The page renders a compact pagination control that delegates navigation to the hook.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Lucide React, existing v2 assets API.

---

### Task 1: Prove server-filtered page requests in the asset hook

**Files:**
- Modify: `src/assets/useAssetLibrary.test.tsx`
- Modify: `src/assets/useAssetLibrary.ts`

- [ ] **Step 1: Write the failing hook tests**

Extend the harness to render `page`, `totalPages`, and buttons that call
`setSelectedMediaTab("video")` and `setPage(2)`. Assert a 125-image result
requests `{ kind: "image", page: 1, pageSize: 30 }`, then page 2 requests the
same kind with `page: 2`. Assert changing to video requests page 1 with
`kind: "video"`.

- [ ] **Step 2: Run the new tests and verify red**

Run: `npm test -- src/assets/useAssetLibrary.test.tsx`

Expected: new assertions fail because the hook has immutable page state and
sends no `kind`.

- [ ] **Step 3: Implement the minimal hook behavior**

Use mutable page state; send `kind` except for the `all` tab; include the tab
and page in the cache key; expose `setPage` and `totalPages`; reset page to 1
for media, query, folder, and favorite changes.

- [ ] **Step 4: Run the hook tests and verify green**

Run: `npm test -- src/assets/useAssetLibrary.test.tsx`

Expected: all hook tests pass.

### Task 2: Render numbered pagination controls

**Files:**
- Modify: `src/assets/AssetLibraryPage.test.tsx`
- Modify: `src/assets/AssetLibraryPage.tsx`

- [ ] **Step 1: Write the failing page tests**

Update the hook mock with page properties and `setPage`. Assert that a five-page
image result renders page numbers and enabled next navigation, clicking page 2
calls `setPage(2)`, and the final page disables next navigation.

- [ ] **Step 2: Run the new page tests and verify red**

Run: `npm test -- src/assets/AssetLibraryPage.test.tsx`

Expected: new assertions fail because the page has no navigation controls.

- [ ] **Step 3: Implement the minimal pagination row**

Render below `AssetGrid` only when `totalPages > 1`. Use accessible Lucide
chevron buttons with boundary disabled states. Render bounded page numbers with
ellipses between gaps; mark the active page with `aria-current="page"`.

- [ ] **Step 4: Run the page tests and verify green**

Run: `npm test -- src/assets/AssetLibraryPage.test.tsx`

Expected: all page tests pass.

### Task 3: Record and verify the completed product change

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Record implementation and validation**

Add a dated entry covering server-side media filtering, 30-item pagination,
page reset on filters, and the test/build commands.

- [ ] **Step 2: Verify focused regressions**

Run: `npm test -- src/assets/useAssetLibrary.test.tsx src/assets/AssetLibraryPage.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 3: Verify production build**

Run: `npm run build`

Expected: Vite build exits with code 0.

- [ ] **Step 4: Commit and push task files**

Run: `git diff --check`, stage only task files, commit
`fix: paginate asset library by media type`, and push
`codex/asset-library-pagination` to `origin`.
