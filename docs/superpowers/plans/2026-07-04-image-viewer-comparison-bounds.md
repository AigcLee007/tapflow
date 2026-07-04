# Image Viewer Comparison Bounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep fullscreen original-comparison dragging bounded to the visible generated-image area.

**Architecture:** Add pure geometry helpers for `object-fit: contain` image rectangles and split-position clamping, then use that rectangle as the comparison stage. The original image fills that stage with `object-fit: cover`; the generated image fills the same stage and is clipped by the split percentage.

**Tech Stack:** React, TypeScript, Vitest, existing fullscreen image viewer.

---

### Task 1: Geometry Helpers

**Files:**
- Modify: `src/flowCanvas/utils/imageViewerComparison.ts`
- Test: `src/flowCanvas/utils/imageViewerComparison.test.ts`

- [x] **Step 1: Add failing tests for contained image rectangles and split clamping**

Run: `npm run test -- src/flowCanvas/utils/imageViewerComparison.test.ts`

- [x] **Step 2: Implement helper functions**

Add `calculateContainedImageRect` and `getComparisonSplitPercentFromClientX`.

- [x] **Step 3: Re-run helper tests**

Run: `npm run test -- src/flowCanvas/utils/imageViewerComparison.test.ts`

### Task 2: Viewer Integration

**Files:**
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`

- [x] **Step 1: Track comparison container size**

Use `ResizeObserver` to keep the left comparison frame dimensions current.

- [x] **Step 2: Render comparison stage inside the contained generated-image rect**

Set the stage style from `calculateContainedImageRect`, use original image `objectFit: 'cover'`, generated image `objectFit: 'cover'`, and clip only inside the stage.

- [x] **Step 3: Clamp dragging to 0-100 over the stage**

Use `getComparisonSplitPercentFromClientX` with the stage bounding rect.

### Task 3: Verification

**Files:**
- Modify: `PROJECT_RECORD.md`

- [x] **Step 1: Update project record**

Record the edge-position fix and validation.

- [x] **Step 2: Run focused tests and build**

Run helper/node tests and `npm run build`.
