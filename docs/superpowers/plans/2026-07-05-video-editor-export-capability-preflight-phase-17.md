# Video Editor Export Capability Preflight Phase 17 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent `剪辑工程` export video nodes from reserving credits or entering worker queues unless the selected video route explicitly declares support for video-editor export workflows.

**Architecture:** Reuse the existing AI route `request_config.capabilities` surface. Add a narrow `supportedVideoWorkflows` capability with the only public value `video_editor_export`, expose it in runtime route responses, and enforce it server-side inside workflow run creation before inserting `workflow_runs`, `node_runs`, billing reservations, or queue jobs.

**Tech Stack:** TypeScript, Fastify API service, Postgres-backed AI Gateway route config, Vitest, existing v2 workflow runner and billing path.

---

### Task 1: Backend Capability Guard

**Files:**
- Modify: `apps/api/src/modules/workflow-runs/workflow-runs.service.ts`
- Modify: `apps/api/test/workflow-pricing-resolver.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests for an exported `video.generate` node:

```ts
expect(() => assertNodeRouteSupportsRuntimeRequest({
  node: {
    id: "video-export",
    type: "video.generate",
    config: {
      params: {
        videoEditor: {
          sourceVideoEditorNodeId: "editor-1",
          timeline: { clips: [], audio: [], subtitles: [], durationMs: 3000 },
        },
      },
    },
  },
  routeContext: {
    capabilities: {
      supportedVideoWorkflows: [],
    },
    modelKey: "mock-video",
    providerKey: "mock-provider",
    routeKey: "video.default",
  },
})).toThrow("UNSUPPORTED_VIDEO_EDITOR_EXPORT");
```

Add a passing assertion when `supportedVideoWorkflows` includes `video_editor_export`, and a passing assertion for ordinary video nodes without `params.videoEditor`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace @aigc-flow/api -- test/workflow-pricing-resolver.test.ts
```

Expected: FAIL because `assertNodeRouteSupportsRuntimeRequest` is not exported.

- [ ] **Step 3: Write minimal implementation**

Extend `RouteRuntimeContext` with:

```ts
capabilities: {
  supportedVideoWorkflows: string[];
};
```

Load `route.request_config` in `loadRouteRuntimeContexts`, read `request_config.capabilities.supportedVideoWorkflows`, keep only `video_editor_export`, and default to an empty array.

Add `assertNodeRouteSupportsRuntimeRequest(...)` and call it in `createWorkflowRun` after pricing/route context load and before the workflow row insert.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test --workspace @aigc-flow/api -- test/workflow-pricing-resolver.test.ts
```

Expected: PASS.

### Task 2: Safe Runtime Route Capability Exposure

**Files:**
- Modify: `apps/api/src/modules/ai-gateway/ai-gateway.service.ts`
- Modify: `apps/api/src/modules/ai-model-catalog/ai-model-catalog.service.ts`
- Modify: `apps/api/test/ai-gateway.service.test.ts`
- Modify: `apps/api/test/ai-model-catalog.service.test.ts`
- Modify: `src/services/v2AiRoutesApi.ts`

- [ ] **Step 1: Write the failing API capability tests**

Extend the existing AI Gateway route tests so `request_config.capabilities.supportedVideoWorkflows` containing `["video_editor_export", "internal-render-mode"]` returns only:

```ts
capabilities: {
  supportedGenerationModes: ["standard"],
  supportedVideoWorkflows: ["video_editor_export"],
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace @aigc-flow/api -- test/ai-gateway.service.test.ts test/ai-model-catalog.service.test.ts
```

Expected: FAIL because `supportedVideoWorkflows` is not mapped.

- [ ] **Step 3: Write minimal implementation**

Add a known-video-workflow allowlist with only `video_editor_export`, merge route/model capabilities like image generation modes, and extend the frontend service type with:

```ts
supportedVideoWorkflows?: string[];
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test --workspace @aigc-flow/api -- test/ai-gateway.service.test.ts test/ai-model-catalog.service.test.ts
```

Expected: PASS.

### Task 3: Validation And Record

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test --workspace @aigc-flow/api -- test/workflow-pricing-resolver.test.ts test/ai-gateway.service.test.ts test/ai-model-catalog.service.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: PASS, allowing existing Browserslist, dynamic-import, and chunk-size warnings.

- [ ] **Step 3: Update project record**

Prepend a `2026-07-05 - Video Editor Export Capability Preflight Phase 17` entry summarizing:

- video-editor export routes now require `video_editor_export` support.
- unsupported routes fail closed with `UNSUPPORTED_VIDEO_EDITOR_EXPORT`.
- no new pricing unit, tables, asset shortcut, browser export, or billing mutation was added.
- validation commands and outcomes.

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/api/src/modules/workflow-runs/workflow-runs.service.ts apps/api/test/workflow-pricing-resolver.test.ts apps/api/src/modules/ai-gateway/ai-gateway.service.ts apps/api/src/modules/ai-model-catalog/ai-model-catalog.service.ts apps/api/test/ai-gateway.service.test.ts apps/api/test/ai-model-catalog.service.test.ts src/services/v2AiRoutesApi.ts PROJECT_RECORD.md docs/superpowers/plans/2026-07-05-video-editor-export-capability-preflight-phase-17.md
git commit -m "feat: guard video editor export routes"
```
