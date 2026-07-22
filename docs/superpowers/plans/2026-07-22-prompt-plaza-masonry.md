# Prompt Plaza Masonry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed-ratio prompt plaza grid with a responsive masonry layout that displays every effect image at its complete intrinsic aspect ratio.

**Architecture:** Use CSS multi-column utilities on the standalone plaza result container and a non-breaking wrapper around each card. Make `PromptCard` choose natural image sizing for full cards while retaining the existing fixed `4:3` crop for compact canvas-panel cards and fixed-ratio missing-image placeholders.

**Tech Stack:** React, TypeScript, Tailwind CSS utilities, Vitest, Testing Library, Vite

---

### Task 1: Add Failing Layout Regressions

**Files:**
- Create: `src/prompts/PromptPlazaPage.test.tsx`
- Modify: `src/prompts/PromptCard.test.tsx`

- [x] **Step 1: Add a plaza masonry regression test**

Create `src/prompts/PromptPlazaPage.test.tsx` with a published prompt fixture, mock `listPrompts`, render `PromptPlazaPage`, and assert that `prompt-plaza-masonry` contains `columns-1`, responsive `columns-*` utilities, and no `grid` utility. Assert that `prompt-masonry-item-prompt-1` contains `break-inside-avoid` and bottom spacing.

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { listPrompts } from "../services/v2PromptsApi";
import { PromptPlazaPage } from "./PromptPlazaPage";

vi.mock("../services/v2PromptsApi", () => ({
  favoritePrompt: vi.fn(),
  getPromptMediaBlob: vi.fn(),
  listPrompts: vi.fn(),
  recordPromptInteraction: vi.fn(),
}));

const prompt = {
  category: "portrait",
  createdAt: "2026-07-20T00:00:00.000Z",
  createdBy: null,
  description: "Soft cinematic portrait",
  externalKey: "portrait-1",
  id: "prompt-1",
  isFavorite: false,
  media: [],
  negativePrompt: null,
  promptText: "cinematic portrait, soft side light",
  publishedAt: "2026-07-20T00:00:00.000Z",
  sortWeight: 0,
  status: "published" as const,
  tags: ["cinematic", "soft-light"],
  tenantId: null,
  title: "Cinematic portrait",
  updatedAt: "2026-07-20T00:00:00.000Z",
  version: 1,
};

describe("PromptPlazaPage", () => {
  beforeEach(() => {
    vi.mocked(listPrompts).mockResolvedValue({ items: [prompt], nextCursor: null });
  });

  test("renders prompt results in responsive masonry columns", async () => {
    render(<PromptPlazaPage />);

    await waitFor(() => expect(screen.getByTestId("prompt-plaza-masonry")).toBeTruthy());
    const masonry = screen.getByTestId("prompt-plaza-masonry");
    expect(masonry.className).toContain("columns-1");
    expect(masonry.className).toContain("sm:columns-2");
    expect(masonry.className).toContain("2xl:columns-5");
    expect(masonry.className).not.toMatch(/(^|\s)grid(\s|$)/);
    expect(screen.getByTestId("prompt-masonry-item-prompt-1").className).toContain("break-inside-avoid");
    expect(screen.getByTestId("prompt-masonry-item-prompt-1").className).toContain("mb-3");
  });
});
```

- [x] **Step 2: Add natural and compact media regression tests**

Extend `src/prompts/PromptCard.test.tsx` with one test that renders a full card with `imageUrl="blob:portrait"` and asserts the image uses `h-auto` without `object-cover` while its wrapper has no fixed `aspect-[4/3]`. Add a second render with `compact` and assert the existing `aspect-[4/3]`, `h-full`, and `object-cover` behavior remains.

```tsx
test("preserves the original image ratio on full plaza cards", () => {
  const { container } = render(<PromptCard imageUrl="blob:portrait" onCopy={vi.fn()} onFavorite={vi.fn()} onOpen={vi.fn()} onReference={vi.fn()} prompt={prompt} />);
  const image = container.querySelector("img");
  expect(image?.className).toContain("h-auto");
  expect(image?.className).not.toContain("object-cover");
  expect(image?.parentElement?.className).not.toContain("aspect-[4/3]");
});

test("keeps the fixed cover ratio on compact canvas cards", () => {
  const { container } = render(<PromptCard compact imageUrl="blob:portrait" onCopy={vi.fn()} onFavorite={vi.fn()} onOpen={vi.fn()} onReference={vi.fn()} prompt={prompt} />);
  const image = container.querySelector("img");
  expect(image?.className).toContain("h-full");
  expect(image?.className).toContain("object-cover");
  expect(image?.parentElement?.className).toContain("aspect-[4/3]");
});
```

- [x] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npx vitest --run src/prompts/PromptCard.test.tsx src/prompts/PromptPlazaPage.test.tsx
```

Expected: FAIL because the plaza has no masonry test ids/classes and the full card still uses a fixed `4:3` cover.

### Task 2: Implement Natural-Ratio Masonry

**Files:**
- Modify: `src/prompts/PromptPlazaPage.tsx`
- Modify: `src/prompts/PromptCard.tsx`

- [x] **Step 1: Change the plaza result container**

Replace the grid result container with:

```tsx
<div
  className="mt-6 columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5"
  data-testid="prompt-plaza-masonry"
>
```

Wrap every `PromptCard` with:

```tsx
<div className="mb-3 break-inside-avoid" data-testid={`prompt-masonry-item-${prompt.id}`} key={prompt.id}>
```

- [x] **Step 2: Preserve intrinsic image dimensions on full cards**

Build the media wrapper class from `compact || !imageUrl` so only compact cards and missing-image states receive `aspect-[4/3]`. Render full-card images with `block h-auto w-full`; render compact images with `h-full w-full object-cover`.

```tsx
<div className={`relative overflow-hidden bg-[#151922] ${compact || !imageUrl ? "aspect-[4/3]" : ""}`}>
  {imageUrl ? (
    <img
      alt=""
      className={compact ? "h-full w-full object-cover" : "block h-auto w-full"}
      decoding="async"
      loading="lazy"
      src={imageUrl}
    />
  ) : (
    <div className="grid h-full place-items-center text-slate-600">
      <ImageIcon size={compact ? 18 : 26} />
    </div>
  )}
</div>
```

- [x] **Step 3: Run the focused tests and verify GREEN**

Run:

```bash
npx vitest --run src/prompts/PromptCard.test.tsx src/prompts/PromptPlazaPage.test.tsx
```

Expected: all prompt card and plaza tests pass.

### Task 3: Record And Verify The Product Change

**Files:**
- Modify: `PROJECT_RECORD.md`

- [x] **Step 1: Update the project record**

Add a dated entry that records the responsive multi-column layout, complete intrinsic image display, unchanged compact-card behavior, and verification commands.

- [x] **Step 2: Run the full frontend build**

Run:

```bash
npm run build
```

Expected: exit code 0. Existing Browserslist or chunk-size warnings may remain, but no compilation error is allowed.

- [x] **Step 3: Run browser visual verification**

Start the local frontend and API path required by the existing authenticated prompt page. Inspect desktop and narrow viewports. Verify portrait and landscape images keep their complete ratio, cards form uneven columns without splitting, controls remain usable, and no overlap or horizontal overflow appears.

- [x] **Step 4: Inspect the final diff**

Run `git diff --check` and inspect `git status --short`. Ensure `src/flowCanvas/flowCanvas.css` and unrelated untracked files are not staged.

- [ ] **Step 5: Commit and push only task files**

Stage the prompt components, prompt tests, implementation plan, and `PROJECT_RECORD.md`. Commit with `feat: add prompt plaza masonry layout`, then push `main` to `origin` and verify `origin/main` resolves to the new commit.
