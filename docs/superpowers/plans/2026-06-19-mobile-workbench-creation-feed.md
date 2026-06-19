# Mobile Workbench Creation Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the phone-width `/workbench` middle area into one chronological creation feed while preserving the current mobile header, bottom creation bar, backend generation flow, and parameter sheet.

**Architecture:** Keep the existing mobile shell, but remove its large current-stage block and route all mobile generations into a single feed component. The feed sorts data by generation creation time, and each card derives a fixed set of output slots from requested count, batch metadata, and available results so partial batches can show finished thumbnails beside generating placeholders.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, existing workbench API types and UI utilities.

---

### Task 1: Lock Mobile Creation Feed Behavior With Tests

**Files:**
- Modify: `src/workbench/WorkbenchPage.test.tsx`

- [ ] **Step 1: Update the mobile dock regression**

Scope the `图片生成` assertion to `workbench-mobile-create-bar` so creation-feed cards with the same label do not conflict with the bottom input bar.

```tsx
const createBar = screen.getByTestId("workbench-mobile-create-bar");
expect(createBar).toBeTruthy();
expect(within(createBar).getByText("图片生成")).toBeTruthy();
```

- [ ] **Step 2: Update the multi-image feed regression**

Assert the new card structure instead of the removed grouped chip.

```tsx
const feed = await screen.findByTestId("workbench-mobile-result-feed");
expect(within(feed).getAllByTestId("workbench-mobile-creation-feed-card")).toHaveLength(1);
expect(screen.getAllByTestId("workbench-mobile-feed-slot-mobile-done-quad")).toHaveLength(4);
expect(screen.getByText("共4张，已完成")).toBeTruthy();
```

- [ ] **Step 3: Update image interaction regression**

Assert that tapping a completed feed cell opens fullscreen preview directly.

```tsx
fireEvent.click(screen.getByTestId("workbench-mobile-thumb-mobile-switch-mobile-switch-result-2"));
await screen.findByTestId("workbench-result-fullscreen");
expect(screen.getByTestId("workbench-result-fullscreen-image").getAttribute("src")).toContain("mobile-switch-2");
```

- [ ] **Step 4: Run focused tests and verify red/green coverage**

Run:

```bash
npm run test -- src/workbench/WorkbenchPage.test.tsx
```

Expected: all tests in `WorkbenchPage.test.tsx` pass.

### Task 2: Simplify Mobile Shell Responsibilities

**Files:**
- Modify: `src/workbench/WorkbenchMobileShell.tsx`
- Modify: `src/workbench/WorkbenchPage.tsx`

- [ ] **Step 1: Remove obsolete current-stage props from the mobile shell**

Delete these props from the mobile shell type and call site:

```tsx
featuredPreviewUrl
getFeaturedGeneration
getPrimaryResult
loading
```

- [ ] **Step 2: Remove mobile-only featured-result derivation**

Delete the now-unused mobile calculations in `WorkbenchPage.tsx`:

```tsx
const featuredGenerationForMobile = React.useMemo(() => getFeaturedGeneration(generations), [generations]);
const featuredPrimaryResultForMobile = featuredGenerationForMobile ? getPrimaryResult(featuredGenerationForMobile) : null;
const featuredPreviewUrlForMobile = useResultPreviewUrl(featuredPrimaryResultForMobile);
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm run test -- src/workbench/WorkbenchPage.test.tsx
```

Expected: all workbench page tests pass.

### Task 3: Finalize Feed Card Data, Placeholder, and Scroll Rules

**Files:**
- Modify: `src/workbench/WorkbenchMobileResultFeed.tsx`
- Modify: `src/workbench/WorkbenchMobileResultCard.tsx`

- [ ] **Step 1: Keep chronological data sorting**

Sort generations by `createdAt` ascending before render:

```tsx
generations.slice().sort((left, right) =>
  new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
)
```

- [ ] **Step 2: Keep slot derivation stable**

Use:

```tsx
Math.max(1, generation.requestedCount, generation.batch?.totalCount, results.length)
```

Completed slots render result images, unfinished slots render pending or failed placeholders.

- [ ] **Step 3: Preserve mobile scrolling**

The mobile shell scroll container remains the only middle-area scroller:

```tsx
className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain ..."
```

The feed itself stays a simple grid so it does not create nested vertical scrolling.

### Task 4: Documentation, Validation, and Commit

**Files:**
- Modify: `PROJECT_RECORD.md`
- Add: `docs/superpowers/specs/2026-06-19-mobile-workbench-creation-feed-design.md`
- Add: `docs/superpowers/plans/2026-06-19-mobile-workbench-creation-feed.md`

- [ ] **Step 1: Update the project record**

Add a dated note that mobile `/workbench` now uses a single chronological creation feed with partial-batch placeholders and direct fullscreen image opening.

- [ ] **Step 2: Run final verification**

Run:

```bash
npm run test -- src/workbench/WorkbenchPage.test.tsx
npm run build
```

Expected: both commands exit with code 0.

- [ ] **Step 3: Stage only relevant files**

Stage only workbench, spec/plan, and project-record files touched by this task.

- [ ] **Step 4: Commit and push**

Run:

```bash
git commit -m "Refine mobile workbench creation feed"
git push origin codex/single-creator-user-billing
```

Expected: commit and push succeed.
