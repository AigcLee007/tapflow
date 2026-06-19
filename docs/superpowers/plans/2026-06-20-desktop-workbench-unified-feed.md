# Desktop Workbench Unified Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the desktop `/workbench` results area into a single chronological result feed that matches the approved mobile card, mosaic, and fullscreen-preview interaction model while preserving the existing desktop left parameter panel and mobile workbench behavior.

**Architecture:** Keep mobile workbench files untouched as the behavior baseline. Add desktop-specific feed/card helpers that reuse the same result-slot and ratio-aware mosaic rules, then swap the desktop right rail from split active/completed sections to one feed with incremental pagination in `WorkbenchPage`.

**Tech Stack:** React, Vite, Vitest, existing workbench components and v2 workbench APIs

---

### Task 1: Lock the approved desktop behavior in tests

**Files:**
- Modify: `src/workbench/WorkbenchPage.test.tsx`

- [ ] **Step 1: Write failing desktop feed tests for unified cards and pagination**

Add or replace desktop-oriented assertions so they verify:

```tsx
test("renders desktop workbench results as a single unified feed without active/completed sections", async () => {
  listWorkbenchGenerationsMock.mockResolvedValue({
    generations: [
      createGeneration({ id: "desktop-0", prompt: "desktop prompt 0", status: "running" }),
      createGeneration({ id: "desktop-1", prompt: "desktop prompt 1", status: "succeeded", results: [createResult("desktop-1")] }),
      createGeneration({ id: "desktop-2", prompt: "desktop prompt 2", status: "queued" }),
      createGeneration({ id: "desktop-3", prompt: "desktop prompt 3", status: "succeeded", results: [createResult("desktop-3")] }),
      createGeneration({ id: "desktop-4", prompt: "desktop prompt 4", status: "failed" }),
    ],
    nextCursor: null,
  });

  setRoute("/workbench");
  renderRouter();

  const feed = await screen.findByTestId("workbench-desktop-result-feed");
  expect(screen.queryByText("Current Tasks")).toBeNull();
  expect(screen.queryByText("Completed")).toBeNull();
  expect(within(feed).getAllByTestId("workbench-desktop-feed-card")).toHaveLength(4);
  expect(screen.queryByText("desktop prompt 4")).toBeNull();
});

test("loads 4 more desktop feed records when scrolling to the bottom", async () => {
  listWorkbenchGenerationsMock.mockResolvedValue({
    generations: Array.from({ length: 10 }, (_, index) =>
      createGeneration({
        id: `desktop-history-${index}`,
        prompt: `desktop history ${index}`,
        status: "succeeded",
        results: [createResult(`desktop-history-${index}`)],
      }),
    ),
    nextCursor: null,
  });

  setRoute("/workbench");
  renderRouter();

  const feed = await screen.findByTestId("workbench-desktop-result-feed");
  const scrollArea = screen.getByTestId("workbench-desktop-result-scroll-area");

  expect(within(feed).getAllByTestId("workbench-desktop-feed-card")).toHaveLength(4);

  fireEvent.scroll(scrollArea, {
    target: {
      clientHeight: 600,
      scrollHeight: 1200,
      scrollTop: 600,
    },
  });

  await waitFor(() => {
    expect(within(feed).getAllByTestId("workbench-desktop-feed-card")).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Write failing desktop tests for mobile-style mosaic and card menu behavior**

Add desktop-specific tests that assert:

```tsx
test("renders desktop wide three and four image cards with the approved mosaic layout", async () => {
  listWorkbenchGenerationsMock.mockResolvedValue({
    generations: [
      createGeneration({
        id: "desktop-wide-three",
        params: { aspect_ratio: "16:9", size: "2k" },
        requestedCount: 3,
        status: "succeeded",
        results: [wideResult("desktop-wide-three", 0), wideResult("desktop-wide-three", 1), wideResult("desktop-wide-three", 2)],
      }),
      createGeneration({
        id: "desktop-wide-four",
        params: { aspect_ratio: "21:9", size: "2k" },
        requestedCount: 4,
        status: "succeeded",
        results: [
          wideResult("desktop-wide-four", 0, 2048, 878),
          wideResult("desktop-wide-four", 1, 2048, 878),
          wideResult("desktop-wide-four", 2, 2048, 878),
          wideResult("desktop-wide-four", 3, 2048, 878),
        ],
      }),
    ],
    nextCursor: null,
  });

  setRoute("/workbench");
  renderRouter();

  expect(await screen.findByTestId("workbench-desktop-mosaic-desktop-wide-three")).toBeTruthy();
  expect(screen.getByTestId("workbench-desktop-mosaic-desktop-wide-three").className).toContain("grid-cols-2");
  expect(document.getElementById("workbench-desktop-feed-slot-desktop-wide-three-2")?.className).toContain("aspect-[16/9]");
  expect(screen.getByTestId("workbench-desktop-mosaic-desktop-wide-four").className).toContain("grid-cols-2");
  expect(document.getElementById("workbench-desktop-feed-slot-desktop-wide-four-0")?.className).toContain("aspect-[21/9]");
});

test("desktop result cards use a menu action model instead of an always-open button panel", async () => {
  listWorkbenchGenerationsMock.mockResolvedValue({
    generations: [
      createGeneration({
        id: "desktop-menu-actions",
        prompt: "desktop menu actions",
        status: "succeeded",
        results: [createResult("desktop-menu-actions")],
      }),
    ],
    nextCursor: null,
  });

  setRoute("/workbench");
  renderRouter();

  expect(await screen.findByTestId("workbench-desktop-feed-card-desktop-menu-actions")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "下载原图" })).toBeNull();

  fireEvent.click(screen.getByLabelText("打开结果菜单-desktop-menu-actions"));

  expect(screen.getByRole("button", { name: "下载原图" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "引用参考" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "重新生成" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "删除记录" })).toBeTruthy();
});
```

- [ ] **Step 3: Write failing desktop fullscreen interaction test**

Add or update one desktop preview test so it confirms thumbnail click directly opens the existing fullscreen preview:

```tsx
test("desktop feed thumbnails open fullscreen preview directly", async () => {
  listWorkbenchGenerationsMock.mockResolvedValue({
    generations: [
      createGeneration({
        id: "desktop-preview",
        status: "succeeded",
        results: [createResult("desktop-preview")],
      }),
    ],
    nextCursor: null,
  });

  setRoute("/workbench");
  renderRouter();

  fireEvent.click(await screen.findByTestId("workbench-desktop-thumb-desktop-preview-desktop-preview-result"));

  expect(await screen.findByTestId("workbench-result-fullscreen")).toBeTruthy();
});
```

- [ ] **Step 4: Run workbench tests to verify failure**

Run: `npm run test -- src/workbench/WorkbenchPage.test.tsx`

Expected: FAIL on missing unified desktop feed, pagination, and menu-driven card behavior.

### Task 2: Add desktop feed-specific layout helpers

**Files:**
- Create: `src/workbench/workbenchResultLayouts.ts`
- Modify: `src/workbench/WorkbenchMobileResultCard.tsx`

- [ ] **Step 1: Add shared slot and mosaic helpers in a new layout module**

Create `src/workbench/workbenchResultLayouts.ts` with pure helpers extracted from mobile behavior:

```ts
import type { WorkbenchGeneration, WorkbenchResult } from "./workbenchTypes";

export type WorkbenchFeedSlot =
  | { index: number; kind: "result"; result: WorkbenchResult }
  | { index: number; kind: "pending" | "failed" };

export type WorkbenchMosaicLayout = {
  containerClassName: string;
  imageClassName: string;
  slotClassNames: string[];
};

export function getSortedWorkbenchResults(results: WorkbenchResult[]) {
  return results
    .slice()
    .sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0));
}

export function getWorkbenchSlotCount(generation: WorkbenchGeneration, results: WorkbenchResult[]) {
  return Math.max(
    1,
    Number(generation.requestedCount || 0),
    Number(generation.batch?.totalCount || 0),
    results.length,
  );
}

export function buildWorkbenchFeedSlots(generation: WorkbenchGeneration, results: WorkbenchResult[]): WorkbenchFeedSlot[] {
  const sortedResults = getSortedWorkbenchResults(results);
  const total = getWorkbenchSlotCount(generation, sortedResults);
  return Array.from({ length: total }, (_, index) => {
    const result = sortedResults[index];
    if (result) return { index, kind: "result", result };
    return { index, kind: generation.status === "failed" || generation.status === "canceled" ? "failed" : "pending" };
  });
}

export function getWorkbenchMosaicLayout(
  generation: WorkbenchGeneration,
  results: WorkbenchResult[],
  slotCount: number,
): WorkbenchMosaicLayout {
  // Move the existing approved mobile ratio-aware logic here unchanged.
}
```

- [ ] **Step 2: Update the mobile card to consume the shared helpers**

Replace duplicated helper logic in `src/workbench/WorkbenchMobileResultCard.tsx` with imports from the new helper file:

```ts
import {
  buildWorkbenchFeedSlots,
  getSortedWorkbenchResults,
  getWorkbenchMosaicLayout,
} from "./workbenchResultLayouts";
```

Keep the mobile card markup and behavior unchanged.

- [ ] **Step 3: Run targeted workbench tests**

Run: `npm run test -- src/workbench/WorkbenchPage.test.tsx -t "uses ratio-aware mobile thumbnail mosaics for wide three and four image batches"`

Expected: PASS for the mobile mosaic baseline after helper extraction.

### Task 3: Implement the desktop unified feed components

**Files:**
- Create: `src/workbench/WorkbenchDesktopResultCard.tsx`
- Create: `src/workbench/WorkbenchDesktopResultFeed.tsx`
- Modify: `src/workbench/WorkbenchPage.tsx`

- [ ] **Step 1: Create the desktop result card component**

Add a focused `WorkbenchDesktopResultCard` that mirrors the approved mobile interaction model:

```tsx
export function WorkbenchDesktopResultCard({
  generation,
  getDisplayResults,
  models,
  onDeleteGeneration,
  onDownloadOriginal,
  onRegenerate,
  onSelectPreview,
  onUseAsReference,
}: Props) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const results = getSortedWorkbenchResults(getDisplayResults(generation));
  const slots = buildWorkbenchFeedSlots(generation, results);
  const mosaicLayout = getWorkbenchMosaicLayout(generation, results, slots.length);
  const selected = results[0] ?? null;

  return (
    <article
      className="relative overflow-visible rounded-[24px] border border-white/8 bg-white/[0.03] p-4"
      data-testid={`workbench-desktop-feed-card-${generation.id}`}
    >
      {/* title, creator-facing params, status line, menu trigger */}
      {/* mosaic grid using desktop-specific data-testid names */}
      {/* no always-open side action panel */}
    </article>
  );
}
```

Desktop-specific requirements:
- use `data-testid="workbench-desktop-feed-card"`
- use `data-testid="workbench-desktop-mosaic-${generation.id}"`
- use `id="workbench-desktop-feed-slot-${generation.id}-${slot.index}"`
- use `data-testid="workbench-desktop-thumb-${generation.id}-${result.id}"`
- use the existing fullscreen sheet by calling `onSelectPreview`
- keep menu rows consistent with the project menu tokens

- [ ] **Step 2: Create the desktop feed wrapper with incremental pagination**

Add `src/workbench/WorkbenchDesktopResultFeed.tsx`:

```tsx
const DESKTOP_FEED_PAGE_SIZE = 4;

export function WorkbenchDesktopResultFeed({
  generations,
  getDisplayResults,
  models,
  onDeleteGeneration,
  onDownloadOriginal,
  onRegenerate,
  onSelectPreview,
  onUseAsReference,
}: Props) {
  const [visibleCount, setVisibleCount] = React.useState(DESKTOP_FEED_PAGE_SIZE);

  React.useEffect(() => {
    setVisibleCount((current) =>
      Math.min(Math.max(current, DESKTOP_FEED_PAGE_SIZE), Math.max(generations.length, DESKTOP_FEED_PAGE_SIZE)),
    );
  }, [generations.length]);

  const visibleGenerations = generations.slice(0, visibleCount);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.scrollTop + element.clientHeight < element.scrollHeight - 32) return;
    setVisibleCount((current) => Math.min(generations.length, current + DESKTOP_FEED_PAGE_SIZE));
  };

  return (
    <section className="..." data-testid="workbench-desktop-result-feed">
      <div className="..." data-testid="workbench-desktop-result-scroll-area" onScroll={handleScroll}>
        {visibleGenerations.map((generation) => (
          <WorkbenchDesktopResultCard ... />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Replace the split desktop right rail in `WorkbenchPage`**

In `src/workbench/WorkbenchPage.tsx`:
- remove the old `DesktopActiveTaskItem`, `DesktopCompletedResultCard`, and `DesktopResultsWorkspace` usage
- stop splitting desktop generations into `activeGenerations` and `completedGenerations` for rendering
- pass the existing `generations` array into `WorkbenchDesktopResultFeed`
- keep mobile `WorkbenchMobileShell` untouched
- keep the existing `WorkbenchResultSheet` preview state and handlers untouched

Use:

```tsx
<WorkbenchDesktopResultFeed
  generations={[...generations].sort((left, right) => right.createdAt.localeCompare(left.createdAt))}
  getDisplayResults={getGenerationDisplayResults}
  models={models}
  onDeleteGeneration={handleDeleteGeneration}
  onDownloadOriginal={handleDownloadOriginal}
  onRegenerate={handleRegenerateFromGeneration}
  onSelectPreview={handleOpenPreviewForGeneration}
  onUseAsReference={handleUseAsReference}
/>
```

- [ ] **Step 4: Run workbench tests to verify the new desktop feed passes**

Run: `npm run test -- src/workbench/WorkbenchPage.test.tsx`

Expected: PASS for updated desktop feed coverage and existing mobile regressions.

### Task 4: Update records and validate production build

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Record the desktop workbench unified feed change**

Add a dated `As of 2026-06-20` entry in `PROJECT_RECORD.md` covering:

```md
- desktop `/workbench` results rail now uses a single chronological result feed instead of separate active/completed sections
- desktop feed cards now follow the approved mobile mosaic rules for 1/2/3/4-image batches, including wide and ultra-wide layouts
- desktop cards now use menu-driven actions and direct thumbnail-to-fullscreen preview flow
- desktop result history now renders the newest 4 records first and loads 4 more when the user scrolls to the bottom
```

- [ ] **Step 2: Run focused validation**

Run: `npm run test -- src/workbench/WorkbenchPage.test.tsx`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 3: Commit**

Run:

```bash
git add PROJECT_RECORD.md src/workbench/WorkbenchPage.test.tsx src/workbench/WorkbenchMobileResultCard.tsx src/workbench/WorkbenchDesktopResultCard.tsx src/workbench/WorkbenchDesktopResultFeed.tsx src/workbench/WorkbenchPage.tsx src/workbench/workbenchResultLayouts.ts docs/superpowers/plans/2026-06-20-desktop-workbench-unified-feed.md
git commit -m "Unify desktop workbench result feed"
```
