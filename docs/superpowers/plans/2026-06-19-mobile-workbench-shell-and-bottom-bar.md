# Mobile Workbench Shell And Bottom Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the mobile `/workbench` shell so it uses a single compact header, a truly scrollable middle result feed, and a JiMeng-style bottom creation bar while preserving the current mobile creation panel UI.

**Architecture:** Keep `WorkbenchPage` as the shared workbench state owner. Update the mobile branch to use a tighter shell contract inside `WorkbenchMobileShell`, replace the current `WorkbenchMobileBottomDock` with a lighter creation-bar entry surface, and preserve `WorkbenchMobileParameterSheet` plus `WorkbenchComposer` content as the detailed editing view.

**Tech Stack:** React, TypeScript, Vite, Tailwind utility classes, Vitest.

---

## File Structure

### Files to modify

- `src/workbench/WorkbenchMobileShell.tsx`
  - mobile frame
  - single top bar
  - scroll container ownership
  - connection to bottom creation bar
- `src/workbench/WorkbenchMobileBottomDock.tsx`
  - replace current summary dock with JiMeng-style creation bar
- `src/workbench/WorkbenchMobileParameterSheet.tsx`
  - only adjust shell-level sizing/position if needed
- `src/workbench/WorkbenchMobileResultFeed.tsx`
  - make feed padding compatible with fixed bottom creation bar
- `src/workbench/WorkbenchPage.tsx`
  - mobile branch sizing and shell integration
- `src/workbench/WorkbenchPage.test.tsx`
  - add regression tests for single header, scroll shell, and bottom bar behavior
- `PROJECT_RECORD.md`
  - record the change and validation

### Files to inspect while implementing

- `src/workbench/WorkbenchComposer.tsx`
- `src/workbench/WorkbenchMobileResultCard.tsx`
- `src/workbench/workbenchTypes.ts`

---

### Task 1: Add failing mobile-shell regression coverage

**Files:**
- Modify: `src/workbench/WorkbenchPage.test.tsx`

- [ ] **Step 1: Write failing tests for the approved mobile shell scope**

Add tests that verify:

- only one mobile title block exists
- the mobile shell exposes a dedicated scroll container
- the bottom creation bar shows a prompt-style entry instead of the old heavy summary dock
- opening the creation bar still opens the existing mobile creation panel

- [ ] **Step 2: Run the test file and confirm the new assertions fail**

Run:

```bash
npm run test -- src/workbench/WorkbenchPage.test.tsx
```

Expected:

- existing tests still run
- new mobile shell assertions fail before implementation

### Task 2: Rebuild the mobile shell layout skeleton

**Files:**
- Modify: `src/workbench/WorkbenchMobileShell.tsx`
- Modify: `src/workbench/WorkbenchPage.tsx`
- Modify: `src/workbench/WorkbenchMobileResultFeed.tsx`

- [ ] **Step 1: Make the mobile workbench shell a fixed-height frame**

Implement:

- top-level mobile shell wrapper with `h-[calc(100dvh-...)]` style ownership
- a column layout with `min-h-0`
- one dedicated middle scroll container

- [ ] **Step 2: Remove duplicated mobile header branding**

Implement:

- one compact mobile header row only
- remove the second branding block currently rendered below it

- [ ] **Step 3: Ensure the middle result region owns scroll**

Implement:

- `overflow-y-auto`
- `min-h-0`
- bottom padding large enough to clear the fixed bottom bar

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test -- src/workbench/WorkbenchPage.test.tsx
```

Expected:

- mobile shell tests move closer to passing
- no desktop regressions

### Task 3: Replace the mobile bottom dock with a JiMeng-style creation bar

**Files:**
- Modify: `src/workbench/WorkbenchMobileBottomDock.tsx`
- Modify: `src/workbench/WorkbenchMobileShell.tsx`

- [ ] **Step 1: Implement the new bottom creation bar layout**

Bar structure:

- left reference entry
- center prompt-style creation surface
- right primary generate button

- [ ] **Step 2: Keep entry behavior lightweight**

Implement:

- tapping left reference entry opens the existing mobile creation panel
- tapping center creation surface opens the existing mobile creation panel
- tapping generate submits directly

- [ ] **Step 3: Show creator-facing summary in the center surface**

Display:

- prompt placeholder or prompt preview
- model / ratio / size / quantity chips

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test -- src/workbench/WorkbenchPage.test.tsx
```

Expected:

- bottom creation bar tests pass

### Task 4: Preserve the existing mobile creation panel while making it fit the new shell

**Files:**
- Modify: `src/workbench/WorkbenchMobileParameterSheet.tsx`

- [ ] **Step 1: Keep the current panel content unchanged**

Do not alter:

- reference section layout
- prompt section layout
- model/route selectors
- ratio/size/quantity row

- [ ] **Step 2: Adjust only shell-level presentation if required**

Allowed:

- max-height tuning
- safe-area padding
- overlay sizing

- [ ] **Step 3: Re-run tests**

Run:

```bash
npm run test -- src/workbench/WorkbenchPage.test.tsx
```

Expected:

- sheet still opens from the bottom creation bar
- existing prompt-related tests remain green

### Task 5: Final regression, docs, and delivery

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update `PROJECT_RECORD.md`**

Record:

- mobile shell skeleton rebuild
- single-header change
- JiMeng-style bottom creation bar
- preserved mobile creation panel

- [ ] **Step 2: Run targeted tests**

Run:

```bash
npm run test -- src/workbench/WorkbenchPage.test.tsx
```

Expected:

- all workbench page tests pass

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected:

- Vite build succeeds

- [ ] **Step 4: Commit**

```bash
git add PROJECT_RECORD.md docs/superpowers/specs/2026-06-19-mobile-workbench-shell-and-bottom-bar-design.md docs/superpowers/plans/2026-06-19-mobile-workbench-shell-and-bottom-bar.md src/workbench/WorkbenchMobileShell.tsx src/workbench/WorkbenchMobileBottomDock.tsx src/workbench/WorkbenchMobileParameterSheet.tsx src/workbench/WorkbenchMobileResultFeed.tsx src/workbench/WorkbenchPage.tsx src/workbench/WorkbenchPage.test.tsx
git commit -m "Refine mobile workbench shell and bottom creation bar"
```

---

## Validation Checklist

- mobile workbench shows only one compact top header
- mobile results can scroll to the end without being hidden behind the bottom bar
- mobile bottom creation bar is visible and lighter than the previous dock
- tapping the bottom creation bar opens the current mobile creation panel
- the creation panel content is preserved
- desktop workbench remains unchanged

## Self-Review

- Spec coverage: the plan covers shell skeleton, single header, new bottom bar, preserved existing panel, and validation.
- Placeholder scan: no `TODO`/`TBD` placeholders remain.
- Type consistency: component names and responsibilities match the approved scope.
