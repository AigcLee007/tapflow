# Prompt Detail Modal Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open prompt details as a shareable, accessible modal over the stable prompt plaza and replace the fixed four-slot square gallery with an intrinsic-ratio main image plus real-media thumbnails.

**Architecture:** Refactor the existing detail component under test, then rename it to `PromptDetailModal`. Route both `/prompts` and `/prompts/:promptId` through one stable `PromptPlazaPage`, using history state to distinguish an in-plaza modal from a directly opened share URL.

**Tech Stack:** React, TypeScript, React DOM portals, Tailwind CSS utilities, Vitest, Testing Library, Vite

---

### Task 1: Drive The Media Viewer With Failing Tests

**Files:**
- Create: `src/prompts/PromptDetailPage.test.tsx`
- Modify: `src/prompts/PromptDetailPage.tsx`

- [ ] **Step 1: Add the single-image regression**

Mock `getPrompt` with exactly one media item and `getPromptMediaBlob` with one Blob. Stub `URL.createObjectURL` to return `blob:media-1`. Render the existing component and assert:

```tsx
const dialog = await screen.findByRole("dialog", { name: "单图提示词" });
const image = within(dialog).getByTestId("prompt-detail-main-image");
expect(image.getAttribute("src")).toBe("blob:media-1");
expect(image.className).toContain("h-auto");
expect(image.className).not.toContain("object-cover");
expect(within(dialog).queryByTestId("prompt-detail-thumbnails")).toBeNull();
expect(within(dialog).queryByText("暂无效果图")).toBeNull();
```

- [ ] **Step 2: Add the multi-image selection regression**

Return two media records and sequential object URLs. Assert the thumbnail rail contains exactly two `查看效果图` buttons. Click `查看效果图 2` and assert the main image changes from `blob:media-1` to `blob:media-2`.

- [ ] **Step 3: Add modal lifecycle regressions**

Render with a focused trigger and assert `role="dialog"`, `aria-modal="true"`, body scroll lock, Escape calling `onClose`, backdrop-only dismissal, close-button focus, and focus restoration after unmount. Add a no-media fixture that renders one `暂无效果图` state rather than four cells. Click the main image, assert an `效果图放大预览` dialog appears with the same full image, then close it and assert the detail dialog remains.

- [ ] **Step 4: Run RED**

Run:

```bash
npx vitest --run src/prompts/PromptDetailPage.test.tsx
```

Expected: FAIL because the current page has no dialog contract, always renders four square slots, crops loaded images, and has no modal dismissal lifecycle.

- [ ] **Step 5: Implement the minimal modal viewer**

Change the component contract to:

```ts
export function PromptDetailPage({ onClose, promptId }: { onClose: () => void; promptId: string })
```

Use a body portal, one selected media id, a real-media thumbnail rail, and these main-image classes:

```tsx
<img
  alt={selectedMedia.altText || ""}
  className="block h-auto w-full"
  data-testid="prompt-detail-main-image"
  src={selectedUrl}
/>
```

Add `role="dialog"`, `aria-modal`, `aria-labelledby`, body scroll lock, focus trap, focus restoration, backdrop dismissal, Escape handling, and image zoom. Keep the existing copy, favorite, reference, prompt text, negative prompt, and project-picker logic.

- [ ] **Step 6: Run GREEN**

Run the focused test and require every media/lifecycle case to pass.

### Task 2: Preserve Actions And Layer Ordering

**Files:**
- Modify: `src/prompts/PromptDetailPage.test.tsx`
- Modify: `src/prompts/PromptDetailPage.tsx`
- Modify: `src/prompts/PromptProjectPicker.tsx`

- [ ] **Step 1: Add action regressions**

Assert `复制提示词` writes only `prompt.promptText`, `收藏` calls `favoritePrompt`, and `引用到画布` opens the `选择项目` dialog above the detail dialog. Cancel the picker and assert detail remains visible.

- [ ] **Step 2: Add topmost-Escape regression**

Open the project picker, press Escape, and assert only the picker closes. Press Escape again and assert the detail `onClose` callback runs.

- [ ] **Step 3: Run RED**

Expected: the picker currently has no Escape behavior and detail Escape would also close beneath it.

- [ ] **Step 4: Implement layer-aware Escape**

Add Escape dismissal and backdrop-only dismissal to `PromptProjectPicker`. In the detail key handler, close image zoom first, ignore Escape while the project picker owns the top layer, and otherwise call `onClose`.

- [ ] **Step 5: Run GREEN**

Run the focused detail test and confirm action and layer tests pass.

### Task 3: Keep The Plaza Mounted Across Prompt URLs

**Files:**
- Create: `src/app/routes.test.ts`
- Modify: `src/app/routes.ts`
- Modify: `src/app/AppRouter.tsx`
- Modify: `src/prompts/promptUi.ts`
- Create: `src/prompts/promptUi.test.ts`
- Modify: `src/prompts/PromptPlazaPage.tsx`
- Modify: `src/prompts/PromptPlazaPage.test.tsx`
- Rename: `src/prompts/PromptDetailPage.tsx` to `src/prompts/PromptDetailModal.tsx`
- Rename: `src/prompts/PromptDetailPage.test.tsx` to `src/prompts/PromptDetailModal.test.tsx`

- [ ] **Step 1: Add route-family regressions**

Add a pure route transition key test:

```ts
expect(getAppRouteTransitionKey("/prompts")).toBe("/prompts");
expect(getAppRouteTransitionKey("/prompts/prompt-1")).toBe("/prompts");
expect(getAppRouteTransitionKey("/assets")).toBe("/assets");
```

Extend the plaza test to rerender from `promptId={null}` to `promptId="prompt-1"` and assert both the existing masonry node and the modal remain present.

- [ ] **Step 2: Add history helper regressions**

Test that opening a card stores `{ promptModalFromPlaza: true }`, preserves query parameters, and pushes `/prompts/:id`. Test that closing an in-plaza modal calls Back, while closing a direct-link modal replaces the URL with `/prompts` plus current filters.

- [ ] **Step 3: Run RED**

Run:

```bash
npx vitest --run src/app/routes.test.ts src/prompts/promptUi.test.ts src/prompts/PromptPlazaPage.test.tsx
```

Expected: FAIL because prompt routes currently use different page components and transition keys, and history has no modal marker.

- [ ] **Step 4: Implement the stable prompt route family**

Add:

```ts
export function getAppRouteTransitionKey(pathname: string): string {
  return pathname === PROMPTS_ROUTE || isPromptDetailRoute(pathname) ? PROMPTS_ROUTE : pathname;
}
```

Map both prompt paths to:

```tsx
<PromptPlazaPage promptId={getPromptId(pathname)} />
```

Use `getAppRouteTransitionKey(pathname)` for the transition wrapper key. Rename the detail component and render it from `PromptPlazaPage` only when `promptId` is present.

- [ ] **Step 5: Implement modal history helpers**

Add `openPromptDetail(path)` and `closePromptDetail(returnUrl)` in `promptUi.ts`. Opening pushes a marker in `history.state`; closing uses Back only for a marked entry and otherwise replaces the direct-link URL before dispatching `popstate`.

- [ ] **Step 6: Run GREEN**

Run route, history, plaza, modal, and prompt card tests together.

### Task 4: Record, Build, And Verify Visually

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update the project record**

Record the modal route family, single-image-first media viewer, real thumbnail count, intrinsic image sizing, preserved actions, and validation evidence.

- [ ] **Step 2: Run focused tests**

```bash
npx vitest --run src/app/routes.test.ts src/prompts/promptUi.test.ts src/prompts/PromptCard.test.tsx src/prompts/PromptPlazaPage.test.tsx src/prompts/PromptDetailModal.test.tsx
```

- [ ] **Step 3: Run the production build**

```bash
npm run build
```

Require exit code 0. Existing Browserslist, CSS utility, dynamic-import, and chunk-size warnings may remain.

- [ ] **Step 4: Run desktop and mobile browser checks**

Use the production components with one-image and multi-image fixtures. At desktop verify the `62% / 38%` split, one main image, exact thumbnail count, no crop, close controls, and background plaza visibility. At a narrow viewport verify one column, sticky top/bottom controls, no horizontal overflow, and no console errors.

- [ ] **Step 5: Audit, commit, and push**

Run `git diff --check`, inspect staged files, exclude `src/flowCanvas/flowCanvas.css` and all unrelated untracked files, commit with `feat: upgrade prompt detail modal`, push `main`, and verify `origin/main` matches local `HEAD`.
