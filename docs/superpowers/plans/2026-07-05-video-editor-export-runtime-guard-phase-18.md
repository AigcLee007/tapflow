# Video Editor Export Runtime Guard Phase 18 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI Gateway runtime-level guard so video-editor export requests cannot be sent to ordinary video provider adapters when a route lacks `video_editor_export` capability.

**Architecture:** Keep Phase 17 API/frontend preflight as the first line of defense, then add a second line inside `DatabaseMediaRuntime.generateVideo`. Detect `request.metadata.videoEditorExport.source === "video_editor_export"` and require the resolved route request config to include `capabilities.supportedVideoWorkflows: ["video_editor_export"]`; otherwise throw `AiGatewayError` before `AiGateway.generateVideo`.

**Tech Stack:** TypeScript, `packages/ai-gateway-core`, Vitest.

---

### Task 1: Runtime Guard

**Files:**
- Modify: `packages/ai-gateway-core/src/database-media-runtime.ts`
- Modify: `packages/ai-gateway-core/test/runtime.test.ts`

- [ ] **Step 1: Write the failing test**

Add a `DatabaseMediaRuntime.generateVideo` test that resolves a route without video workflow support, sends:

```ts
metadata: {
  videoEditorExport: {
    source: "video_editor_export",
  },
}
```

and asserts:

```ts
await expect(runtime.generateVideo(context, request)).rejects.toMatchObject({
  code: "UNSUPPORTED_VIDEO_EDITOR_EXPORT",
});
expect(generateVideoAdapter).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- test/runtime.test.ts
```

Expected: FAIL because the runtime still delegates the editor-export request to the provider adapter.

- [ ] **Step 3: Write minimal implementation**

Add helpers in `database-media-runtime.ts`:

```ts
function isVideoEditorExportRequest(request: VideoGenerationRequest): boolean
function routeSupportsVideoEditorExport(route: ResolvedRoute): boolean
function assertRouteSupportsVideoEditorExport(route: ResolvedRoute, request: VideoGenerationRequest): void
```

Call the assertion after route resolution and request-config override merge, before `generateVideo` delegates to `AiGateway`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- test/runtime.test.ts
```

Expected: PASS.

### Task 2: Validation And Record

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Run package build**

Run:

```bash
npm run build --workspace @aigc-flow/ai-gateway-core
```

Expected: PASS.

- [ ] **Step 2: Run root build**

Run:

```bash
npm run build
```

Expected: PASS, allowing existing Browserslist, dynamic-import, and chunk-size warnings.

- [ ] **Step 3: Update project record**

Prepend a `2026-07-05 - Video Editor Export Runtime Guard Phase 18` entry summarizing:

- AI Gateway runtime now blocks unsupported video-editor exports before provider calls.
- Provider secrets/request payloads are not exposed.
- Billing behavior remains reserve -> worker failure -> refund through existing failure path.
- validation commands and outcomes.

- [ ] **Step 4: Commit**

Run:

```bash
git add packages/ai-gateway-core/src/database-media-runtime.ts packages/ai-gateway-core/test/runtime.test.ts PROJECT_RECORD.md docs/superpowers/plans/2026-07-05-video-editor-export-runtime-guard-phase-18.md
git commit -m "feat: guard video editor export runtime"
```
