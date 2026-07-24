# Prompt Plaza Responsive Masonry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Prompt Plaza's five-column wide-desktop masonry with a 340 px adaptive column-width layout that renders four readable columns in the current 1600 px content area.

**Architecture:** Keep the existing CSS multi-column masonry and card component. Change only the masonry container's column sizing from fixed breakpoint counts to one adaptive CSS column-width rule, preserving the existing gap, item flow, image ratios, actions, and media loading behavior.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Testing Library

---

### Task 1: Implement Adaptive Masonry Columns

**Files:**
- Modify: `src/prompts/PromptPlazaPage.test.tsx`
- Modify: `src/prompts/PromptPlazaPage.tsx`

- [ ] **Step 1: Write the failing regression test**

Replace the fixed-breakpoint assertions in `renders prompt results in responsive masonry columns` with:

```ts
expect(masonry.className).toContain("columns-[340px]");
expect(masonry.className).not.toMatch(/(?:^|\s)(?:sm|md|lg|xl|2xl):columns-/);
expect(masonry.className).not.toMatch(/(^|\s)grid(\s|$)/);
expect(item.className).toContain("break-inside-avoid");
expect(item.className).toContain("mb-3");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/prompts/PromptPlazaPage.test.tsx
```

Expected: FAIL because the existing masonry class contains fixed breakpoint columns and does not contain `columns-[340px]`.

- [ ] **Step 3: Implement the minimal layout change**

Change the masonry container class in `PromptPlazaPage.tsx` from:

```tsx
className="mt-6 columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5"
```

to:

```tsx
className="mt-6 columns-[340px] gap-3"
```

Keep `data-testid`, item wrappers, and `PromptCard` usage unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- src/prompts/PromptPlazaPage.test.tsx
```

Expected: all `PromptPlazaPage` tests pass.

### Task 2: Record and Verify the Product Change

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update the project record**

Append a dated entry documenting:

- Prompt Plaza now uses a 340 px adaptive masonry column width;
- the 1600 px desktop content area renders four columns;
- narrower content areas reduce the count instead of compressing cards;
- card content, media APIs, WebP caching, and storage remain unchanged;
- no migration or environment change is required.

- [ ] **Step 2: Run focused and production verification**

Run:

```bash
npm test -- src/prompts/PromptPlazaPage.test.tsx src/prompts/PromptCard.test.tsx
npm run build
```

Expected: both commands exit successfully. Existing unrelated build warnings may remain, but no new error is allowed.

- [ ] **Step 3: Review the scoped diff**

Run:

```bash
git diff --check -- src/prompts/PromptPlazaPage.tsx src/prompts/PromptPlazaPage.test.tsx PROJECT_RECORD.md docs/superpowers/plans/2026-07-24-prompt-plaza-responsive-masonry.md
```

Expected: no whitespace errors and no changes to `PromptCard`, APIs, database, storage, or unrelated dirty files.

- [ ] **Step 4: Commit and push**

Stage only the two prompt plaza files, `PROJECT_RECORD.md`, and this implementation plan. Commit with:

```bash
git commit -m "fix: improve prompt plaza masonry density"
git push origin main
```

Expected: both the previously committed design document and this implementation commit are present on `origin/main`.
