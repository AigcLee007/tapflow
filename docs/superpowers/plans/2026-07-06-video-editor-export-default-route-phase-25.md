# Video Editor Export Default Route Phase 25 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `剪辑工程` export-to-canvas video nodes default to the installable `video.editor.ffmpeg` route.

**Architecture:** Keep the export as a normal canvas `video` node so v2 draft persistence, pricing preflight, workflow run creation, billing reserve/settle/refund, asset persistence, and worker execution stay unchanged. The only behavior change is the route key written into the exported node data.

**Tech Stack:** React, Vitest, Testing Library, existing Flow canvas production studio shell.

---

## File Structure

- Modify `src/flowCanvas/studios/ProductionStudioShell.tsx`: define the FFmpeg export route key and add it to exported video node data.
- Modify `src/flowCanvas/studios/ProductionStudioShell.test.tsx`: prove the studio export request includes the route key.
- Modify `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`: prove the canvas-created video node persists the route key.
- Modify `PROJECT_RECORD.md`: record Phase 25.

## Task 1: Red Tests

**Files:**
- Modify: `src/flowCanvas/studios/ProductionStudioShell.test.tsx`
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`

- [ ] **Step 1: Update studio shell test expectation**

In `exports a safe video node request from the video editor timeline`, add:

```ts
        routeKey: 'video.editor.ffmpeg',
```

inside the expected exported `data` object.

- [ ] **Step 2: Update canvas integration test expectation**

In `creates a runnable video node from the video editor export request`, change:

```ts
expect(exported?.data.routeKey).toBe('video.default');
```

to:

```ts
expect(exported?.data.routeKey).toBe('video.editor.ffmpeg');
```

- [ ] **Step 3: Run tests to verify red**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: FAIL because the export request still omits the FFmpeg route key and the node factory falls back to `video.default`.

## Task 2: Implement Default Route

**Files:**
- Modify: `src/flowCanvas/studios/ProductionStudioShell.tsx`

- [ ] **Step 1: Add a local constant**

Near the other top-level constants/types, add:

```ts
const VIDEO_EDITOR_EXPORT_ROUTE_KEY = 'video.editor.ffmpeg';
```

- [ ] **Step 2: Set route key in export data**

Inside `exportVideoToCanvas`, add:

```ts
        routeKey: VIDEO_EDITOR_EXPORT_ROUTE_KEY,
```

to the `data` object passed to `onCreateCanvasNodeFromStudio`.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: PASS.

## Task 3: Validation, Record, Commit

**Files:**
- Modify: `PROJECT_RECORD.md`
- Track: `docs/superpowers/plans/2026-07-06-video-editor-export-default-route-phase-25.md`

- [ ] **Step 1: Update project record**

Add a 2026-07-06 Phase 25 entry covering:

- video editor export-created video nodes now use `video.editor.ffmpeg`.
- execution still requires the route/template to be installed and active.
- no billing, storage, DB schema, or browser-local export path changed.

- [ ] **Step 2: Run verification**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
npm run build
git diff --check
```

Expected: PASS, allowing existing build warnings.

- [ ] **Step 3: Commit**

```bash
git add src/flowCanvas/studios/ProductionStudioShell.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx PROJECT_RECORD.md docs/superpowers/plans/2026-07-06-video-editor-export-default-route-phase-25.md
git commit -m "feat: default video editor exports to ffmpeg route"
```
