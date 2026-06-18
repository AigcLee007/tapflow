# Workbench Two-Column Results Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the desktop `/workbench` shell from a three-pane layout into a two-column `3:7` workbench with a preserved left parameter dock and a right internal-scrolling results workspace.

**Architecture:** Keep the existing workbench data flow and composer UI, but replace the desktop stage/history split with a simpler active/completed partition. The left dock remains visually unchanged while the right side becomes a single internal-scrolling workspace composed of a compact active status band and a single-column completed-results rail.

**Tech Stack:** React, TypeScript, Vitest, existing workbench APIs and hooks, Tailwind utility classes.

---

## File Structure

- Modify: `src/workbench/workbenchDesktopLayout.ts`
  - simplify desktop partition helpers to active/completed derivation
- Modify: `src/workbench/workbenchDesktopLayout.test.ts`
  - replace stage-centric assertions with active/completed partition coverage
- Modify: `src/workbench/WorkbenchPage.tsx`
  - remove desktop center-stage layout
  - render two-column `3:7` shell
  - add right-side active status band + completed horizontal rail
- Modify: `src/workbench/WorkbenchPage.test.tsx`
  - add regression coverage for two-column desktop layout and right-side partition behavior
- Modify: `PROJECT_RECORD.md`
  - record the shift from three-pane desktop shell to two-column results-rail shell

### Task 1: Replace Desktop Partition Logic With Active/Completed Helpers

**Files:**
- Modify: `src/workbench/workbenchDesktopLayout.ts`
- Modify: `src/workbench/workbenchDesktopLayout.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the current test file contents with:

```ts
import { describe, expect, test } from "vitest";

import {
  getWorkbenchActiveGenerations,
  getWorkbenchCompletedGenerations,
} from "./workbenchDesktopLayout";

function generation(id: string, status: string, createdAt: string, resultCount = 1) {
  return {
    chargedCredits: null,
    createdAt,
    displayMode: "merged" as const,
    errorJson: null,
    estimatedCredits: 1,
    finishedAt: null,
    id,
    modelId: "pixellelabs.nano-banana-pro",
    params: {},
    prompt: id,
    referenceAssetIds: [],
    referenceUploadIds: [],
    requestedCount: 1,
    reservedCredits: 1,
    reserveLedgerId: null,
    results: Array.from({ length: resultCount }, (_, index) => ({
      assetId: `${id}-asset-${index}`,
      createdAt,
      downloadUrl: null,
      downloadUrlExpiresAt: null,
      height: 1024,
      id: `${id}-result-${index}`,
      metadata: {},
      mimeType: "image/png",
      originalFilename: `${id}.png`,
      previewUrl: `https://example.com/${id}.png`,
      previewUrlExpiresAt: null,
      sortOrder: index,
      status: "available",
      width: 1024,
    })),
    routeKey: "image.pixellelabs.nano-banana-pro",
    sessionId: null,
    startedAt: null,
    status,
    updatedAt: createdAt,
  };
}

describe("workbenchDesktopLayout", () => {
  test("collects queued and running generations into the active band", () => {
    const items = getWorkbenchActiveGenerations([
      generation("done-1", "succeeded", "2026-06-18T08:00:00.000Z"),
      generation("queued-1", "queued", "2026-06-18T09:00:00.000Z", 0),
      generation("running-1", "running", "2026-06-18T10:00:00.000Z", 0),
    ]);

    expect(items.map((item) => item.id)).toEqual(["running-1", "queued-1"]);
  });

  test("treats succeeded generations without results as still active", () => {
    const items = getWorkbenchActiveGenerations([
      generation("blank-1", "succeeded", "2026-06-18T10:00:00.000Z", 0),
      generation("done-1", "succeeded", "2026-06-18T09:00:00.000Z", 1),
    ]);

    expect(items.map((item) => item.id)).toEqual(["blank-1"]);
  });

  test("keeps only succeeded generations with results in the completed rail", () => {
    const items = getWorkbenchCompletedGenerations([
      generation("failed-1", "failed", "2026-06-18T11:00:00.000Z", 0),
      generation("done-2", "succeeded", "2026-06-18T10:00:00.000Z", 1),
      generation("blank-1", "succeeded", "2026-06-18T09:00:00.000Z", 0),
      generation("done-1", "succeeded", "2026-06-18T08:00:00.000Z", 1),
    ]);

    expect(items.map((item) => item.id)).toEqual(["done-2", "done-1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/workbench/workbenchDesktopLayout.test.ts
```

Expected: FAIL because the new helper exports do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Replace `src/workbench/workbenchDesktopLayout.ts` contents with:

```ts
import type { WorkbenchGeneration } from "./workbenchTypes";

const ACTIVE_STATUSES = new Set(["pending", "queued", "running", "waiting_provider"]);

function byCreatedDesc(left: WorkbenchGeneration, right: WorkbenchGeneration) {
  return right.createdAt.localeCompare(left.createdAt);
}

export function isWorkbenchGenerationAwaitingResult(generation: WorkbenchGeneration) {
  return generation.status === "succeeded" && generation.results.length === 0;
}

export function isWorkbenchGenerationActive(generation: WorkbenchGeneration) {
  return ACTIVE_STATUSES.has(generation.status) || isWorkbenchGenerationAwaitingResult(generation);
}

export function isWorkbenchGenerationCompleted(generation: WorkbenchGeneration) {
  return generation.status === "succeeded" && generation.results.length > 0;
}

export function getWorkbenchActiveGenerations(generations: WorkbenchGeneration[]) {
  return [...generations].filter(isWorkbenchGenerationActive).sort(byCreatedDesc);
}

export function getWorkbenchCompletedGenerations(generations: WorkbenchGeneration[]) {
  return [...generations].filter(isWorkbenchGenerationCompleted).sort(byCreatedDesc);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run src/workbench/workbenchDesktopLayout.test.ts
```

Expected: PASS.

### Task 2: Rebuild Desktop Workbench Into a Two-Column `3:7` Shell

**Files:**
- Modify: `src/workbench/WorkbenchPage.tsx`
- Modify: `src/workbench/WorkbenchPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test to `src/workbench/WorkbenchPage.test.tsx`:

```ts
test("renders desktop workbench as a two-column 3:7 shell with active band and completed rail", async () => {
  listWorkbenchGenerationsMock.mockResolvedValue({
    generations: [
      createGeneration({ id: "queued-1", prompt: "queued", status: "queued" }),
      createGeneration({
        id: "done-1",
        prompt: "done-1",
        status: "succeeded",
        results: [
          {
            assetId: "done-1-asset",
            createdAt: new Date().toISOString(),
            downloadUrl: "https://example.com/done-1.png",
            downloadUrlExpiresAt: null,
            height: 1024,
            id: "done-1-result",
            metadata: {},
            mimeType: "image/png",
            originalFilename: "done-1.png",
            previewUrl: "https://example.com/done-1.png",
            previewUrlExpiresAt: null,
            sortOrder: 0,
            status: "available",
            width: 1024,
          },
        ],
      }),
    ],
    nextCursor: null,
  });

  setRoute("/workbench");
  renderRouter();

  expect(await screen.findByTestId("workbench-page")).toBeTruthy();
  expect(screen.getByTestId("workbench-desktop-layout").className).toContain("lg:grid-cols-[minmax(84px,3fr)_minmax(0,7fr)]");
  expect(screen.getByTestId("workbench-active-band")).toBeTruthy();
  expect(screen.getByTestId("workbench-completed-rail")).toBeTruthy();
  expect(screen.getAllByTestId("workbench-active-item").length).toBe(1);
  expect(screen.getAllByTestId("workbench-completed-history-item").length).toBe(1);
  expect(screen.queryByTestId("workbench-stage")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/workbench/WorkbenchPage.test.tsx -t "renders desktop workbench as a two-column 3:7 shell with active band and completed rail"
```

Expected: FAIL because the current desktop shell still renders the removed stage layout.

- [ ] **Step 3: Write minimal implementation**

Update `src/workbench/WorkbenchPage.tsx` to:

- remove desktop use of `WorkbenchStage`
- remove desktop use of `DesktopRecentPane`
- keep the left dock
- add a new right workspace container with:
  - `data-testid="workbench-desktop-layout"`
  - `data-testid="workbench-active-band"`
  - `data-testid="workbench-completed-rail"`
  - `data-testid="workbench-active-item"` on each active item
- use `lg:grid-cols-[minmax(84px,3fr)_minmax(0,7fr)]`

Implementation rules:

- derive desktop collections from:
  - `getWorkbenchActiveGenerations(generations)`
  - `getWorkbenchCompletedGenerations(generations)`
- right workspace must be one internal scroll surface
- left composer column remains untouched visually
- remove desktop-only center-stage helper components if no longer needed

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run src/workbench/WorkbenchPage.test.tsx -t "renders desktop workbench as a two-column 3:7 shell with active band and completed rail"
```

Expected: PASS.

### Task 3: Convert Completed Results To Single-Column Horizontal Cards

**Files:**
- Modify: `src/workbench/WorkbenchPage.tsx`
- Modify: `src/workbench/WorkbenchPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test to `src/workbench/WorkbenchPage.test.tsx`:

```ts
test("renders completed desktop results as horizontal cards in a single-column rail", async () => {
  listWorkbenchGenerationsMock.mockResolvedValue({
    generations: [
      createGeneration({
        id: "done-1",
        prompt: "done-1",
        status: "succeeded",
        results: [
          {
            assetId: "done-1-asset",
            createdAt: new Date().toISOString(),
            downloadUrl: "https://example.com/done-1.png",
            downloadUrlExpiresAt: null,
            height: 1024,
            id: "done-1-result",
            metadata: {},
            mimeType: "image/png",
            originalFilename: "done-1.png",
            previewUrl: "https://example.com/done-1.png",
            previewUrlExpiresAt: null,
            sortOrder: 0,
            status: "available",
            width: 1024,
          },
        ],
      }),
    ],
    nextCursor: null,
  });

  setRoute("/workbench");
  renderRouter();

  expect(await screen.findByTestId("workbench-completed-rail")).toBeTruthy();
  expect(screen.getByTestId("workbench-completed-history-list").className).toContain("grid-cols-1");
  expect(screen.getByTestId("workbench-completed-history-item-done-1")).toBeTruthy();
  expect(screen.getByTestId("workbench-completed-history-item-done-1").className).toContain("grid-cols-[120px_minmax(0,1fr)]");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/workbench/WorkbenchPage.test.tsx -t "renders completed desktop results as horizontal cards in a single-column rail"
```

Expected: FAIL because completed cards are still vertical dock cards.

- [ ] **Step 3: Write minimal implementation**

In `src/workbench/WorkbenchPage.tsx`:

- replace the desktop completed-history card rendering with a dedicated horizontal card
- add:
  - `data-testid="workbench-completed-history-list"`
  - `data-testid="workbench-completed-history-item-${generation.id}"`
- make each card use a two-column thumbnail/content layout:

```tsx
className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 ..."
```

Keep existing actions:

- retry
- reuse parameters
- open/select result

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run src/workbench/WorkbenchPage.test.tsx -t "renders completed desktop results as horizontal cards in a single-column rail"
```

Expected: PASS.

### Task 4: Record the Layout Shift and Run Final Verification

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update the project record**

Add a new dated entry describing:

- removal of the desktop current-task center pane
- new desktop `3:7` two-column shell
- right-side internal scroll workspace
- top active status band
- single-column horizontal completed results rail

- [ ] **Step 2: Run focused verification**

Run:

```bash
npx vitest run src/workbench/workbenchDesktopLayout.test.ts src/workbench/WorkbenchPage.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run build verification**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add PROJECT_RECORD.md docs/superpowers/specs/2026-06-18-workbench-two-column-results-rail-design.md docs/superpowers/plans/2026-06-18-workbench-two-column-results-rail.md src/workbench/workbenchDesktopLayout.ts src/workbench/workbenchDesktopLayout.test.ts src/workbench/WorkbenchPage.tsx src/workbench/WorkbenchPage.test.tsx
git commit -m "feat: rebuild workbench into a two-column results rail"
```
