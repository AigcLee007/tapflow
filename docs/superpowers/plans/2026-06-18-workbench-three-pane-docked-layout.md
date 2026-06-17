# Workbench Three-Pane Docked Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the desktop `/workbench` experience into a fixed `3:5:2` docked layout with a stable left parameter dock, a center current/recent task stage capped at 8 items, and a right completed-only history dock.

**Architecture:** Keep the existing workbench data flow and parameter composer, but split desktop layout responsibilities into deterministic view-derivation helpers and a docked page shell. The left composer gets a pinned footer action region, while the page shell partitions generation history into center-stage and right-history streams.

**Tech Stack:** React, TypeScript, Vitest, existing Tailwind utility classes, existing `/api/v2/workbench/*` services.

---

## File Structure

- Modify: `src/workbench/WorkbenchPage.tsx`
  - Replace the current ad hoc two/three-column layout with a fixed docked desktop shell.
  - Add left/right collapse behavior.
  - Render center primary stage + recent task window.
  - Render right completed-only dock.
- Modify: `src/workbench/WorkbenchComposer.tsx`
  - Preserve control UI, but split into scrollable body + pinned footer action area.
- Create: `src/workbench/workbenchDesktopLayout.ts`
  - Own desktop generation partitioning rules: active detection, completed-only history, primary stage selection, center recent list capping.
- Create: `src/workbench/workbenchDesktopLayout.test.ts`
  - Regression coverage for task partition rules.
- Modify: `src/workbench/WorkbenchPage.test.tsx`
  - Add desktop layout behavior tests for right dock completed-only history, center-pane recent cap, and pinned composer action structure.
- Modify: `PROJECT_RECORD.md`
  - Record the workbench desktop docked layout change and validation.

### Task 1: Add Desktop Generation Partition Helpers

**Files:**
- Create: `src/workbench/workbenchDesktopLayout.ts`
- Test: `src/workbench/workbenchDesktopLayout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";

import {
  getWorkbenchCompletedHistory,
  getWorkbenchDesktopStage,
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
  test("prefers the newest active generation for the center stage", () => {
    const stage = getWorkbenchDesktopStage([
      generation("done-1", "succeeded", "2026-06-18T08:00:00.000Z"),
      generation("active-1", "running", "2026-06-18T09:00:00.000Z", 0),
    ]);

    expect(stage.primary?.id).toBe("active-1");
  });

  test("keeps succeeded generations without results out of completed history", () => {
    const completed = getWorkbenchCompletedHistory([
      generation("ready", "succeeded", "2026-06-18T09:00:00.000Z"),
      generation("blank", "succeeded", "2026-06-18T10:00:00.000Z", 0),
    ]);

    expect(completed.map((item) => item.id)).toEqual(["ready"]);
  });

  test("caps the center recent window so total stage items do not exceed eight", () => {
    const inputs = Array.from({ length: 10 }, (_, index) =>
      generation(`done-${index}`, "succeeded", `2026-06-18T0${index}:00:00.000Z`),
    );

    const stage = getWorkbenchDesktopStage(inputs);

    expect(stage.recent.length).toBeLessThanOrEqual(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/workbench/workbenchDesktopLayout.test.ts
```

Expected: fail because `src/workbench/workbenchDesktopLayout.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

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

export function getWorkbenchCompletedHistory(generations: WorkbenchGeneration[]) {
  return [...generations].filter(isWorkbenchGenerationCompleted).sort(byCreatedDesc);
}

export function getWorkbenchDesktopStage(generations: WorkbenchGeneration[]) {
  const sorted = [...generations].sort(byCreatedDesc);
  const primary =
    sorted.find(isWorkbenchGenerationActive) ??
    sorted.find(isWorkbenchGenerationCompleted) ??
    sorted[0] ??
    null;

  const remaining = sorted
    .filter((generation) => generation.id !== primary?.id)
    .filter((generation) => isWorkbenchGenerationActive(generation) || isWorkbenchGenerationCompleted(generation) || generation.status === "failed")
    .slice(0, primary ? 7 : 8);

  return { primary, recent: remaining };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run src/workbench/workbenchDesktopLayout.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workbench/workbenchDesktopLayout.ts src/workbench/workbenchDesktopLayout.test.ts
git commit -m "test: add workbench desktop task partition rules"
```

### Task 2: Rebuild the Desktop Workbench Shell

**Files:**
- Modify: `src/workbench/WorkbenchPage.tsx`
- Test: `src/workbench/WorkbenchPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
test("shows only completed tasks in the right dock and caps center recent items", async () => {
  listWorkbenchGenerationsMock.mockResolvedValue({
    generations: [
      createGeneration({ id: "queued-1", prompt: "queued", status: "queued" }),
      createGeneration({ id: "running-1", prompt: "running", status: "running" }),
      createGeneration({ id: "failed-1", prompt: "failed", status: "failed" }),
      ...Array.from({ length: 8 }, (_, index) =>
        createGeneration({
          id: `done-${index}`,
          prompt: `done-${index}`,
          status: "succeeded",
          results: [{
            assetId: `done-${index}-asset`,
            createdAt: new Date().toISOString(),
            downloadUrl: `https://example.com/done-${index}.png`,
            downloadUrlExpiresAt: null,
            height: 1024,
            id: `done-${index}-result`,
            metadata: {},
            mimeType: "image/png",
            originalFilename: `done-${index}.png`,
            previewUrl: `https://example.com/done-${index}.png`,
            previewUrlExpiresAt: null,
            sortOrder: 0,
            status: "available",
            width: 1024,
          }],
        }),
      ),
    ],
    nextCursor: null,
  });

  setRoute("/workbench");
  renderRouter();

  expect(await screen.findByTestId("workbench-page")).toBeTruthy();
  expect(screen.getAllByTestId("workbench-center-recent-item").length).toBeLessThanOrEqual(7);
  expect(screen.getAllByTestId("workbench-completed-history-item").length).toBe(8);
  expect(screen.queryByTestId("workbench-completed-history-item-queued-1")).toBeNull();
  expect(screen.queryByTestId("workbench-completed-history-item-running-1")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/workbench/WorkbenchPage.test.tsx -t "shows only completed tasks in the right dock and caps center recent items"
```

Expected: FAIL because the current page does not expose the docked layout structure or filtered right history.

- [ ] **Step 3: Write minimal implementation**

```tsx
const desktopStage = getWorkbenchDesktopStage(generations);
const completedHistory = getWorkbenchCompletedHistory(generations);

<div className="hidden h-full min-h-0 lg:grid lg:grid-cols-[minmax(360px,3fr)_minmax(0,5fr)_minmax(260px,2fr)] lg:gap-4">
  <LeftDock />
  <CenterStage primary={desktopStage.primary} recent={desktopStage.recent} />
  <RightDock generations={completedHistory} />
</div>
```

Implementation details:

- reduce header height so the shell gets more usable vertical space
- move desktop page container to `overflow-hidden`
- add independent pane scrollers
- add left/right collapse buttons and narrow collapsed rails
- use `data-testid` hooks for:
  - `workbench-left-dock`
  - `workbench-center-recent-item`
  - `workbench-completed-history-item`

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run src/workbench/WorkbenchPage.test.tsx -t "shows only completed tasks in the right dock and caps center recent items"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workbench/WorkbenchPage.tsx src/workbench/WorkbenchPage.test.tsx
git commit -m "feat: dock the desktop workbench into three panes"
```

### Task 3: Pin the Composer Footer Action Area

**Files:**
- Modify: `src/workbench/WorkbenchComposer.tsx`
- Test: `src/workbench/WorkbenchPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
test("keeps the desktop composer footer action area separate from the scroll body", async () => {
  setRoute("/workbench");
  renderRouter();

  expect(await screen.findByTestId("workbench-page")).toBeTruthy();
  expect(screen.getByTestId("workbench-composer-scroll-body")).toBeTruthy();
  expect(screen.getByTestId("workbench-composer-footer")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/workbench/WorkbenchPage.test.tsx -t "keeps the desktop composer footer action area separate from the scroll body"
```

Expected: FAIL because the current composer is one scrolling column without separate test hooks.

- [ ] **Step 3: Write minimal implementation**

```tsx
<aside className="flex min-h-0 flex-col overflow-hidden ...">
  <div data-testid="workbench-composer-scroll-body" className="min-h-0 flex-1 overflow-y-auto pr-1">
    {parameterSections}
  </div>
  <div data-testid="workbench-composer-footer" className="shrink-0 border-t border-white/8 bg-[#101014] pt-3">
    {summaryCard}
    {generateButton}
  </div>
</aside>
```

Rules:

- keep control visuals unchanged
- only separate scroll behavior and footer docking
- preserve compact mobile behavior when embedded in the mobile sheet

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run src/workbench/WorkbenchPage.test.tsx -t "keeps the desktop composer footer action area separate from the scroll body"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workbench/WorkbenchComposer.tsx src/workbench/WorkbenchPage.test.tsx
git commit -m "feat: pin workbench composer footer actions"
```

### Task 4: Record and Verify the Change

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update the project record**

Add a new dated entry describing:

- the fixed `3:5:2` desktop workbench docking
- completed-only right history
- center-pane current/recent split with recent cap
- pinned left composer footer

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
git add PROJECT_RECORD.md src/workbench/workbenchDesktopLayout.ts src/workbench/workbenchDesktopLayout.test.ts src/workbench/WorkbenchPage.tsx src/workbench/WorkbenchPage.test.tsx src/workbench/WorkbenchComposer.tsx docs/superpowers/plans/2026-06-18-workbench-three-pane-docked-layout.md
git commit -m "feat: rebuild desktop workbench as a docked studio"
```
