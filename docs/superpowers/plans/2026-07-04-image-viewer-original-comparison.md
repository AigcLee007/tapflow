# Image Viewer Original Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an original-image comparison mode to the fullscreen image viewer for image-to-image results and show image timestamps with accurate time.

**Architecture:** Persist the first reference image used by a generation in the generation snapshot, resolve a display URL for that reference when the fullscreen viewer opens, and render a draggable split comparison only when a valid reference exists. Date formatting stays local to viewer metadata and changes from date-only to minute-level date/time.

**Tech Stack:** Vite, React, TypeScript, Vitest, existing asset API helpers.

---

### Task 1: Metadata Utilities

**Files:**
- Create: `src/flowCanvas/utils/imageViewerComparison.ts`
- Test: `src/flowCanvas/utils/imageViewerComparison.test.ts`

- [x] **Step 1: Write failing tests**

Cover:
- `formatImageViewerDateTime(1783120740000)` returns `YYYY/MM/DD HH:mm` for the local timezone date.
- `buildImageViewerComparisonSource` returns the first reference chip and classifies `asset:<id>` as an asset reference.
- Empty reference chips produce `null`.

- [x] **Step 2: Run the test and verify it fails**

Run: `npm run test -- src/flowCanvas/utils/imageViewerComparison.test.ts`
Expected: FAIL because `imageViewerComparison.ts` does not exist.

- [x] **Step 3: Implement the utilities**

Add small pure helpers for date/time formatting and first-reference comparison metadata.

- [x] **Step 4: Run the test and verify it passes**

Run: `npm run test -- src/flowCanvas/utils/imageViewerComparison.test.ts`
Expected: PASS.

### Task 2: Viewer Integration

**Files:**
- Modify: `src/flowCanvas/types.ts`
- Modify: `src/flowCanvas/runtime/v2WorkflowRunner.ts`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`

- [x] **Step 1: Add snapshot field**

Add optional `referenceComparison` metadata to `FlowImageGenerationSnapshot`.

- [x] **Step 2: Save first reference for new generations**

When image generation starts from the canvas, write first-reference metadata to the node so the runtime snapshot can copy it into `lastGenerationSnapshot`.

- [x] **Step 3: Resolve comparison display URL**

Pass the snapshot comparison metadata to the fullscreen overlay. Resolve asset references through signed asset URLs and use stable current canvas URLs as a fallback for existing upstream references.

- [x] **Step 4: Render split comparison**

Add `原图对比` / `返回生成图` button only when a generated image has a resolved reference image. In comparison mode, render generated image and original reference image with a draggable vertical divider.

### Task 3: Verification

**Files:**
- Modify: `PROJECT_RECORD.md`

- [x] **Step 1: Update project record**

Add a short dated entry describing original comparison and timestamp behavior.

- [x] **Step 2: Run focused tests**

Run: `npm run test -- src/flowCanvas/utils/imageViewerComparison.test.ts src/flowCanvas/utils/imageViewerFileSize.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/nodes/ImageMoreMenu.test.tsx`
Expected: PASS.

- [x] **Step 3: Run build**

Run: `npm run build`
Expected: PASS, allowing existing Vite chunk/Browserslist warnings.
