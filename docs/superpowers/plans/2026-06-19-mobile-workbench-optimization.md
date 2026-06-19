# Mobile Workbench Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/workbench` mobile experience into a true phone-first creation workstation while preserving existing backend generation, billing, upload, and history behavior.

**Architecture:** Keep `WorkbenchPage` as the shared state owner, preserve the existing desktop shell, and introduce dedicated mobile shell, bottom dock, parameter sheet, reference-strip, and result-feed components. Reuse the current workbench data hooks and APIs, but stop presenting the desktop composer as the mobile UI.

**Tech Stack:** React, Vite, TypeScript, Tailwind utility classes, existing workbench hooks/services, Vitest.

---

## File Structure

### Existing files to modify

- `src/workbench/WorkbenchPage.tsx`
  - split desktop/mobile presentation responsibilities more cleanly
  - wire the new mobile shell and mobile parameter sheet
- `src/workbench/WorkbenchPage.test.tsx`
  - add mobile layout and interaction regression coverage
- `src/workbench/WorkbenchMobileComposer.tsx`
  - either replace with a thin compatibility wrapper or retire in favor of the new mobile sheet
- `PROJECT_RECORD.md`
  - record the mobile workbench optimization once implementation is complete

### New files to create

- `src/workbench/WorkbenchMobileShell.tsx`
- `src/workbench/WorkbenchMobileBottomDock.tsx`
- `src/workbench/WorkbenchMobileParameterSheet.tsx`
- `src/workbench/WorkbenchMobileReferenceStrip.tsx`
- `src/workbench/WorkbenchMobileResultFeed.tsx`
- `src/workbench/WorkbenchMobileResultCard.tsx`

### Existing files to inspect while implementing

- `src/workbench/WorkbenchComposer.tsx`
- `src/workbench/WorkbenchResultSheet.tsx`
- `src/workbench/useWorkbenchGenerations.ts`
- `src/workbench/workbenchReferences.ts`
- `src/workbench/workbenchModelParams.ts`

---

### Task 1: Extract mobile shell boundaries from `WorkbenchPage`

**Files:**
- Modify: `src/workbench/WorkbenchPage.tsx`
- Create: `src/workbench/WorkbenchMobileShell.tsx`
- Test: `src/workbench/WorkbenchPage.test.tsx`

- [ ] Step 1: Add a failing mobile-shell regression test in `src/workbench/WorkbenchPage.test.tsx`
- [ ] Step 2: Run `npm run test -- src/workbench/WorkbenchPage.test.tsx`
- [ ] Step 3: Extract a `WorkbenchMobileShell` component and move mobile-only frame rendering into it
- [ ] Step 4: Re-run `npm run test -- src/workbench/WorkbenchPage.test.tsx`
- [ ] Step 5: Commit mobile shell extraction

### Task 2: Build the persistent mobile bottom action dock

**Files:**
- Create: `src/workbench/WorkbenchMobileBottomDock.tsx`
- Modify: `src/workbench/WorkbenchMobileShell.tsx`
- Modify: `src/workbench/WorkbenchPage.test.tsx`

- [ ] Step 1: Add a failing test asserting mobile bottom dock visibility and summary text
- [ ] Step 2: Run `npm run test -- src/workbench/WorkbenchPage.test.tsx`
- [ ] Step 3: Implement `WorkbenchMobileBottomDock` with:
  - model/route summary
  - ratio/size/quantity summary
  - fixed primary create button
- [ ] Step 4: Wire the dock into `WorkbenchMobileShell`
- [ ] Step 5: Re-run `npm run test -- src/workbench/WorkbenchPage.test.tsx`
- [ ] Step 6: Commit the bottom dock

### Task 3: Replace the current mobile composer with a true mobile parameter sheet

**Files:**
- Create: `src/workbench/WorkbenchMobileParameterSheet.tsx`
- Modify: `src/workbench/WorkbenchPage.tsx`
- Modify: `src/workbench/WorkbenchMobileComposer.tsx`
- Modify: `src/workbench/WorkbenchPage.test.tsx`

- [ ] Step 1: Add failing tests for opening/closing the mobile parameter sheet and keeping the generate action visible
- [ ] Step 2: Run `npm run test -- src/workbench/WorkbenchPage.test.tsx`
- [ ] Step 3: Build `WorkbenchMobileParameterSheet` with grouped sections:
  - prompt
  - references
  - model/route
  - ratio/size/quantity
  - advanced fields when applicable
- [ ] Step 4: Keep `WorkbenchPage` as the draft owner and pass shared handlers into the new sheet
- [ ] Step 5: Convert `WorkbenchMobileComposer.tsx` into either a compatibility wrapper over the new sheet or remove its old bottom-sheet logic from page usage
- [ ] Step 6: Re-run `npm run test -- src/workbench/WorkbenchPage.test.tsx`
- [ ] Step 7: Commit the mobile parameter sheet

### Task 4: Build a dedicated mobile reference-strip component

**Files:**
- Create: `src/workbench/WorkbenchMobileReferenceStrip.tsx`
- Modify: `src/workbench/WorkbenchMobileParameterSheet.tsx`
- Modify: `src/workbench/WorkbenchPage.test.tsx`
- Test: `src/workbench/workbenchReferences.test.ts`

- [ ] Step 1: Add failing tests for immediate local preview, remove action, and `@图N` insertion affordance in the mobile sheet
- [ ] Step 2: Run `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
- [ ] Step 3: Implement mobile reference cards with:
  - horizontal touch scrolling
  - preview thumbnail
  - `图N` badge
  - remove button
  - quick insert action
- [ ] Step 4: Reuse existing upload and prompt-reference logic instead of introducing new storage behavior
- [ ] Step 5: Re-run `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
- [ ] Step 6: Commit the mobile reference strip

### Task 5: Create a mobile-first result feed

**Files:**
- Create: `src/workbench/WorkbenchMobileResultFeed.tsx`
- Create: `src/workbench/WorkbenchMobileResultCard.tsx`
- Modify: `src/workbench/WorkbenchMobileShell.tsx`
- Modify: `src/workbench/WorkbenchPage.test.tsx`

- [ ] Step 1: Add failing tests for mobile result feed rendering with latest result/task priority
- [ ] Step 2: Run `npm run test -- src/workbench/WorkbenchPage.test.tsx`
- [ ] Step 3: Implement a simplified mobile result feed that shows:
  - current task card
  - latest completed results
  - compact creator-facing metadata
  - mobile-friendly action affordances
- [ ] Step 4: Wire the feed into `WorkbenchMobileShell`
- [ ] Step 5: Re-run `npm run test -- src/workbench/WorkbenchPage.test.tsx`
- [ ] Step 6: Commit the mobile result feed

### Task 6: Add mobile multi-image selection and partial-progress presentation

**Files:**
- Modify: `src/workbench/WorkbenchMobileResultCard.tsx`
- Modify: `src/workbench/WorkbenchMobileResultFeed.tsx`
- Modify: `src/workbench/WorkbenchPage.test.tsx`

- [ ] Step 1: Add failing tests for grouped multi-image mobile rendering and partial child completion visibility
- [ ] Step 2: Run `npm run test -- src/workbench/WorkbenchPage.test.tsx`
- [ ] Step 3: Implement grouped multi-image display using:
  - one selected preview
  - horizontal thumbnail/gallery row
  - partial child placeholders while later images are still pending
- [ ] Step 4: Ensure thumbnail selection does not force fullscreen preview
- [ ] Step 5: Re-run `npm run test -- src/workbench/WorkbenchPage.test.tsx`
- [ ] Step 6: Commit multi-image mobile behavior

### Task 7: Refine mobile fullscreen preview usage flow

**Files:**
- Modify: `src/workbench/WorkbenchResultSheet.tsx`
- Modify: `src/workbench/WorkbenchPage.tsx`
- Modify: `src/workbench/WorkbenchPage.test.tsx`

- [ ] Step 1: Add failing tests for mobile fullscreen preview fit behavior and predictable close/open flow
- [ ] Step 2: Run `npm run test -- src/workbench/WorkbenchPage.test.tsx`
- [ ] Step 3: Adjust fullscreen preview for mobile so:
  - the image fits by longest side
  - controls remain reachable
  - same-batch image switching can be supported from the selected mobile result context
- [ ] Step 4: Re-run `npm run test -- src/workbench/WorkbenchPage.test.tsx`
- [ ] Step 5: Commit preview refinements

### Task 8: Clean up copy, spacing, and safe-area behavior

**Files:**
- Modify: `src/workbench/WorkbenchMobileShell.tsx`
- Modify: `src/workbench/WorkbenchMobileBottomDock.tsx`
- Modify: `src/workbench/WorkbenchMobileParameterSheet.tsx`
- Modify: `src/workbench/WorkbenchPage.tsx`
- Modify: `src/workbench/WorkbenchPage.test.tsx`

- [ ] Step 1: Add failing tests for mobile safe-area bottom spacing and visible primary-action behavior
- [ ] Step 2: Run `npm run test -- src/workbench/WorkbenchPage.test.tsx`
- [ ] Step 3: Normalize:
  - Chinese copy
  - spacing
  - touch target heights
  - safe-area padding
  - fixed top/bottom region layering
- [ ] Step 4: Re-run `npm run test -- src/workbench/WorkbenchPage.test.tsx`
- [ ] Step 5: Commit the visual cleanup

### Task 9: Regression pass, docs, and validation

**Files:**
- Modify: `PROJECT_RECORD.md`
- Modify: `src/workbench/WorkbenchPage.test.tsx`

- [ ] Step 1: Update `PROJECT_RECORD.md` with the mobile workbench optimization summary and validation evidence
- [ ] Step 2: Run `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
- [ ] Step 3: Run `npm run build`
- [ ] Step 4: Review mobile and desktop `/workbench` manually in browser-sized viewports before final delivery
- [ ] Step 5: Commit docs and final regression updates

---

## Validation Checklist

- mobile `/workbench` is fullscreen and not wrapped in homepage-like navigation
- mobile bottom action dock remains visible at phone heights
- mobile parameter editing happens in a dedicated sheet, not the old desktop-style composer sheet
- reference uploads show immediate preview and support quick `@图N` insertion
- current task and latest result remain obvious on first screen
- multi-image generations show grouped partial progress on mobile
- fullscreen preview remains usable on mobile
- desktop `/workbench` behavior is preserved

## Suggested Commit Sequence

1. `refactor: extract mobile workbench shell`
2. `feat: add mobile workbench bottom dock`
3. `feat: add mobile parameter sheet`
4. `feat: add mobile reference strip`
5. `feat: add mobile result feed`
6. `feat: support mobile grouped multi-image results`
7. `fix: refine mobile fullscreen preview behavior`
8. `style: polish mobile safe-area workbench layout`
9. `docs: record mobile workbench optimization`

## Self-Review

- Spec coverage: the plan covers top bar, stage, bottom dock, parameter sheet, references, result feed, multi-image behavior, fullscreen preview, and validation.
- Placeholder scan: no `TODO`/`TBD` placeholders are left in the task list.
- Type consistency: all new component names are consistent between architecture and task breakdown.
