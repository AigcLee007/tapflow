# Video Editor Local Render Workflow Phase 23 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `剪辑工程` / video-editor export `video.generate` nodes into the worker-local FFmpeg render path when the selected server-side route explicitly declares the internal render engine.

**Architecture:** Add a worker-only route capability resolver that reads `ai_routes.request_config.capabilities.videoEditorRenderEngine` for the effective video route and allows local rendering only when it equals `ffmpeg`. When allowed, `WorkflowNodeExecutionService` loads the render-plan asset storage lookups, calls `VideoEditorLocalRenderService`, maps the local-file output through the existing `MediaAssetStore` persistence and billing settlement path, and deletes the local output temp directory in a `finally` block after persistence or failure. Routes without this internal capability continue through the existing provider runtime path and the existing `UNSUPPORTED_VIDEO_EDITOR_EXPORT` guard.

**Tech Stack:** TypeScript, Vitest, Postgres test helpers, existing `StorageProvider`, existing `MediaAssetStore`, existing `VideoEditorLocalRenderService`, existing v2 workflow billing path.

---

### File Structure

- Modify `apps/worker/src/workflow-runtime/service.ts`
  - Import `rm` for output temp cleanup.
  - Import `VideoEditorLocalRenderService` and its result/asset lookup types.
  - Add a worker-only `VideoEditorRenderRouteCapability` query for `request_config.capabilities.videoEditorRenderEngine`.
  - Add optional constructor injection for `videoEditorLocalRenderService`.
  - Route `video.generate` editor exports through local render only when the selected route capability is `ffmpeg`.
  - Persist the local `MediaOutput` through the existing `mapMediaOutcome` path and clean the output temp directory after finalization.
- Modify `apps/worker/test/worker.test.ts`
  - Add a database-backed test for successful local render export: route has `supportedVideoWorkflows: ["video_editor_export"]` and `videoEditorRenderEngine: "ffmpeg"`, provider runtime is not called, output is persisted as an asset, billing settles, node JSON contains only asset refs.
  - Add a database-backed test for fallback/guard behavior: route has only public editor-export support, local renderer is not called, existing provider runtime rejects with `UNSUPPORTED_VIDEO_EDITOR_EXPORT`.
- Modify `PROJECT_RECORD.md`
  - Add Phase 23 notes and validation evidence.

---

### Task 1: Failing Worker Integration Tests

**Files:**
- Modify: `apps/worker/test/worker.test.ts`

- [ ] **Step 1: Import temp-file helpers**

Add:

```ts
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
```

The file already imports `randomUUID` from `node:crypto`; keep that import as-is.

- [ ] **Step 2: Extend `createWorkflowService` test helper**

Add an optional `videoEditorLocalRenderService` parameter:

```ts
  videoEditorLocalRenderService?: ConstructorParameters<typeof WorkflowNodeExecutionService>[0]["videoEditorLocalRenderService"];
```

Pass it into `new WorkflowNodeExecutionService({ ... })`:

```ts
    videoEditorLocalRenderService: options.videoEditorLocalRenderService,
```

- [ ] **Step 3: Write failing local-render success test**

Add this test near the existing `video.generate` worker tests:

```ts
  test("video.generate editor export uses route-enabled local ffmpeg render and persists an asset", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const imageAssetId = "00000000-0000-4000-8000-000000000701";
        const seeded = await seedWorkflowRuntime(appPool, {
          inputNodeStatus: "succeeded",
          middleNodeConfig: {
            generationPrompt: "render editor timeline",
            params: {
              videoEditor: {
                aspect: "16:9",
                resolution: "1920x1080",
                sourceVideoEditorNodeId: "video-editor-1",
                timeline: {
                  clips: [
                    { id: "clip-1", assetId: imageAssetId, kind: "image", track: 0, startMs: 0, inMs: 0, outMs: 3000, speed: 1 },
                  ],
                  durationMs: 3000,
                  audio: [],
                  subtitles: [],
                },
              },
            },
            routeKey: "video.editor.ffmpeg",
          },
          middleNodeStatus: "runnable",
          middleNodeType: "video.generate",
        });
        const storageProvider = new MemoryStorageProvider();
        storageProvider.objects.set("test-bucket/tenants/source/editor-image.png", {
          body: Buffer.from("fake image bytes"),
          contentType: "image/png",
          metadata: {},
        });

        await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            await client.query(
              `
                INSERT INTO ai_providers (id, key, name, kind, status, default_base_url, capabilities, updated_at)
                VALUES (
                  $1::uuid,
                  'local-ffmpeg-provider',
                  'Local FFmpeg',
                  'mock',
                  'active',
                  'https://provider.invalid',
                  '{}'::jsonb,
                  now()
                )
              `,
              ["00000000-0000-4000-8000-000000000702"],
            );
            await client.query(
              `
                INSERT INTO ai_models (id, provider_id, model_key, display_name, modality, capabilities, status, updated_at)
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  'local-ffmpeg',
                  'Local FFmpeg',
                  'video',
                  '{"supportedVideoWorkflows":["video_editor_export"]}'::jsonb,
                  'active',
                  now()
                )
              `,
              ["00000000-0000-4000-8000-000000000703", "00000000-0000-4000-8000-000000000702"],
            );
            await client.query(
              `
                INSERT INTO ai_routes (tenant_id, provider_id, model_id, route_key, modality, status, request_config, pricing, rate_limit, updated_at)
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3::uuid,
                  'video.editor.ffmpeg',
                  'video',
                  'active',
                  '{"capabilities":{"supportedVideoWorkflows":["video_editor_export"],"videoEditorRenderEngine":"ffmpeg"}}'::jsonb,
                  '{}'::jsonb,
                  '{}'::jsonb,
                  now()
                )
              `,
              [seeded.tenantId, "00000000-0000-4000-8000-000000000702", "00000000-0000-4000-8000-000000000703"],
            );
            await client.query(
              `
                INSERT INTO assets (
                  id,
                  tenant_id,
                  project_id,
                  owner_user_id,
                  kind,
                  mime_type,
                  bucket,
                  object_key,
                  original_filename,
                  width,
                  height,
                  status,
                  source
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3::uuid,
                  $4::uuid,
                  'image',
                  'image/png',
                  'test-bucket',
                  'tenants/source/editor-image.png',
                  'editor-image.png',
                  1920,
                  1080,
                  'available',
                  'upload'
                )
              `,
              [imageAssetId, seeded.tenantId, seeded.projectId, seeded.userId],
            );
          },
          appPool,
        );

        const localRenderTempDirs: string[] = [];
        const render = vi.fn(async ({ plan }: { plan: { output: { durationMs: number; height: number; width: number } } }) => {
          const outputPath = `${process.env.TEMP ?? "C:/Windows/Temp"}/tapflow-test-render-${randomUUID()}/rendered-output.mp4`;
          localRenderTempDirs.push(dirname(outputPath));
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, Buffer.from("rendered local video"));
          return {
            output: {
              durationMs: plan.output.durationMs,
              height: plan.output.height,
              localFilePath: outputPath,
              mimeType: "video/mp4",
              width: plan.output.width,
            },
            tempDir: "already-cleaned-input-dir",
          };
        });
        const generateVideo = vi.fn(async () => {
          throw new Error("provider video generation should not be called");
        });
        const nodeQueue = createFakeNodeExecuteQueue();
        const service = createWorkflowService({
          mediaGenerationRuntime: {
            async generateImage() {
              throw new Error("not used");
            },
            generateVideo,
            async pollTask() {
              throw new Error("not used");
            },
          },
          nodeQueue,
          pollQueue: createFakeProviderPollQueue(),
          pool: appPool,
          storageProvider,
          videoEditorLocalRenderService: {
            render,
          },
        });

        await processNodeExecuteJob(
          {
            data: {
              nodeRunId: seeded.middleNodeRunId,
              tenantId: seeded.tenantId,
              traceId: "trace-local-video-render",
              workflowRunId: seeded.workflowRunId,
            },
            id: "job-local-video-render",
            queueName: QUEUE_NAMES.nodeExecute,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        const state = await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            const nodeRun = await client.query<{ status: string; output_json: Record<string, unknown> }>(
              "SELECT status, output_json FROM node_runs WHERE id = $1::uuid",
              [seeded.middleNodeRunId],
            );
            const assets = await client.query<{ count: number }>(
              "SELECT COUNT(*)::int AS count FROM assets WHERE workflow_run_id = $1::uuid AND kind = 'video'",
              [seeded.workflowRunId],
            );
            const usage = await client.query<{ event_type: string; metadata: Record<string, unknown>; unit_type: string; units: string }>(
              "SELECT event_type, metadata, unit_type, units::text AS units FROM usage_events WHERE workflow_run_id = $1::uuid",
              [seeded.workflowRunId],
            );
            return {
              assets: assets.rows[0]?.count ?? 0,
              nodeRun: nodeRun.rows[0],
              usage: usage.rows[0],
            };
          },
          appPool,
        );

        expect(render).toHaveBeenCalledTimes(1);
        expect(render.mock.calls[0]?.[0]).toMatchObject({
          assetLookups: expect.any(Map),
          tenantId: seeded.tenantId,
          workflowRunId: seeded.workflowRunId,
        });
        expect(generateVideo).not.toHaveBeenCalled();
        expect(state.nodeRun.status).toBe("succeeded");
        expect(state.assets).toBe(1);
        expect(state.nodeRun.output_json.assets).toHaveLength(1);
        expect(state.nodeRun.output_json.assets[0]).toMatchObject({
          kind: "video",
          mimeType: "video/mp4",
          durationMs: 3000,
          height: 1080,
          width: 1920,
        });
        expect(JSON.stringify(state.nodeRun.output_json)).not.toMatch(/base64|localFilePath|rendered-output/);
        expect(state.usage).toMatchObject({
          event_type: "ai.video.generate",
          unit_type: "output_count",
          units: "1.000000",
        });
        expect(state.usage.metadata.videoEditorExport).toMatchObject({
          billingUnit: "video_generation",
          source: "video_editor_export",
          sourceVideoEditorNodeId: "video-editor-1",
        });
        for (const dir of localRenderTempDirs) {
          await expect(stat(dir)).rejects.toThrow();
        }
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
```

Expected initial failure: `videoEditorLocalRenderService` is not accepted by the service constructor and the worker still calls provider video generation.

- [ ] **Step 4: Write failing provider fallback/guard test**

Add:

```ts
  test("video.generate editor export without internal render engine keeps provider guard behavior", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const seeded = await seedWorkflowRuntime(appPool, {
          inputNodeStatus: "succeeded",
          middleNodeConfig: {
            generationPrompt: "render editor timeline",
            params: {
              videoEditor: {
                timeline: {
                  clips: [
                    { id: "clip-1", assetId: "00000000-0000-4000-8000-000000000801", kind: "image", track: 0, startMs: 0, inMs: 0, outMs: 3000, speed: 1 },
                  ],
                  durationMs: 3000,
                  audio: [],
                  subtitles: [],
                },
              },
            },
            routeKey: "video.editor.provider",
          },
          middleNodeStatus: "runnable",
          middleNodeType: "video.generate",
        });
        await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            await client.query(
              `
                INSERT INTO ai_providers (id, key, name, kind, status, default_base_url, capabilities, updated_at)
                VALUES ($1::uuid, 'provider-video', 'Provider Video', 'mock', 'active', 'https://provider.invalid', '{}'::jsonb, now())
              `,
              ["00000000-0000-4000-8000-000000000802"],
            );
            await client.query(
              `
                INSERT INTO ai_models (id, provider_id, model_key, display_name, modality, capabilities, status, updated_at)
                VALUES ($1::uuid, $2::uuid, 'provider-video-model', 'Provider Video', 'video', '{"supportedVideoWorkflows":["video_editor_export"]}'::jsonb, 'active', now())
              `,
              ["00000000-0000-4000-8000-000000000803", "00000000-0000-4000-8000-000000000802"],
            );
            await client.query(
              `
                INSERT INTO ai_routes (tenant_id, provider_id, model_id, route_key, modality, status, request_config, pricing, rate_limit, updated_at)
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3::uuid,
                  'video.editor.provider',
                  'video',
                  'active',
                  '{"capabilities":{"supportedVideoWorkflows":["video_editor_export"]}}'::jsonb,
                  '{}'::jsonb,
                  '{}'::jsonb,
                  now()
                )
              `,
              [seeded.tenantId, "00000000-0000-4000-8000-000000000802", "00000000-0000-4000-8000-000000000803"],
            );
          },
          appPool,
        );

        const render = vi.fn(async () => {
          throw new Error("local render should not be used");
        });
        const generateVideo = vi.fn(async () => {
          throw new AiGatewayError({
            code: "UNSUPPORTED_VIDEO_EDITOR_EXPORT",
            message: "Route video.editor.provider does not support video editor export.",
            statusCode: 422,
          });
        });
        const service = createWorkflowService({
          mediaGenerationRuntime: {
            async generateImage() {
              throw new Error("not used");
            },
            generateVideo,
            async pollTask() {
              throw new Error("not used");
            },
          },
          nodeQueue: createFakeNodeExecuteQueue(),
          pollQueue: createFakeProviderPollQueue(),
          pool: appPool,
          storageProvider: new MemoryStorageProvider(),
          videoEditorLocalRenderService: {
            render,
          },
        });

        await expect(
          processNodeExecuteJob(
            {
              data: {
                nodeRunId: seeded.middleNodeRunId,
                tenantId: seeded.tenantId,
                traceId: "trace-provider-guard",
                workflowRunId: seeded.workflowRunId,
              },
              id: "job-provider-guard",
              queueName: QUEUE_NAMES.nodeExecute,
            } as never,
            createTestLogger(),
            { executionService: service },
          ),
        ).rejects.toThrow("Route video.editor.provider does not support video editor export.");

        expect(render).not.toHaveBeenCalled();
        expect(generateVideo).toHaveBeenCalledTimes(1);
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
```

Expected initial failure: after constructor support exists, the worker may still try local rendering unless it requires the internal route capability.

- [ ] **Step 5: Run worker tests to verify red**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/worker.test.ts
```

Expected: FAIL for the new local-render behavior before implementation.

### Task 2: Worker Route Capability And Local Render Execution

**Files:**
- Modify: `apps/worker/src/workflow-runtime/service.ts`

- [ ] **Step 1: Add imports**

Add:

```ts
import { rm } from "node:fs/promises";
```

Add:

```ts
import {
  VideoEditorLocalRenderService,
  type VideoEditorLocalRenderResult,
  type VideoEditorRenderAssetLookup,
} from "./video-editor-local-render-service.js";
```

- [ ] **Step 2: Add local-render route capability helpers**

Add:

```ts
type VideoEditorRenderRouteCapability = {
  renderEngine: "ffmpeg" | null;
  routeKey: string;
};

const VIDEO_EDITOR_EXPORT_WORKFLOW = "video_editor_export";
const VIDEO_EDITOR_FFMPEG_RENDER_ENGINE = "ffmpeg";

function readVideoEditorExportRenderPlan(request: VideoGenerationRequest): unknown | null {
  const metadata = isPlainObject(request.metadata) ? request.metadata : {};
  const videoEditorExport = isPlainObject(metadata.videoEditorExport) ? metadata.videoEditorExport : {};
  return videoEditorExport.source === VIDEO_EDITOR_EXPORT_WORKFLOW ? videoEditorExport.renderPlan ?? null : null;
}

function resolveVideoRequestRouteKey(config: Record<string, unknown>): string {
  return readTrimmedString(config.routeKey) ?? "video.default";
}

function readVideoEditorRenderEngine(requestConfig: Record<string, unknown> | null): "ffmpeg" | null {
  const capabilities = isPlainObject(requestConfig?.capabilities) ? requestConfig.capabilities : {};
  return capabilities.videoEditorRenderEngine === VIDEO_EDITOR_FFMPEG_RENDER_ENGINE ? VIDEO_EDITOR_FFMPEG_RENDER_ENGINE : null;
}

function localOutputDirFromRenderResult(result: VideoEditorLocalRenderResult): string | null {
  const localFilePath = typeof result.output.localFilePath === "string" ? result.output.localFilePath.trim() : "";
  if (!localFilePath) {
    return null;
  }
  return dirname(localFilePath);
}
```

If `dirname` is already imported for tests only, production `service.ts` must import it from `node:path`.

- [ ] **Step 3: Add service constructor injection**

Add a property:

```ts
readonly videoEditorLocalRenderService: Pick<VideoEditorLocalRenderService, "render">;
```

Add constructor option:

```ts
videoEditorLocalRenderService?: Pick<VideoEditorLocalRenderService, "render">;
```

Initialize:

```ts
this.videoEditorLocalRenderService = options.videoEditorLocalRenderService ?? new VideoEditorLocalRenderService({
  storageProvider: options.storageProvider,
});
```

- [ ] **Step 4: Add route capability lookup**

Add a private method:

```ts
  private async loadVideoEditorRenderRouteCapability(
    client: PoolClient,
    tenantId: string,
    routeKey: string,
  ): Promise<VideoEditorRenderRouteCapability | null> {
    const result = await client.query<{ request_config: Record<string, unknown>; route_key: string }>(
      `
        SELECT
          route.route_key,
          COALESCE(route.request_config, '{}'::jsonb) AS request_config
        FROM ai_routes AS route
        JOIN ai_providers AS provider
          ON provider.id = route.provider_id
        LEFT JOIN ai_models AS model
          ON model.id = route.model_id
        WHERE route.status = 'active'
          AND route.modality = 'video'
          AND route.route_key = $1
          AND (route.tenant_id = $2::uuid OR route.tenant_id IS NULL)
          AND provider.status = 'active'
          AND (route.model_id IS NULL OR model.status = 'active')
        ORDER BY
          CASE WHEN route.tenant_id = $2::uuid THEN 0 ELSE 1 END ASC,
          route.updated_at DESC,
          route.id ASC
        LIMIT 1
      `,
      [routeKey, tenantId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      renderEngine: readVideoEditorRenderEngine(row.request_config),
      routeKey: row.route_key,
    };
  }
```

- [ ] **Step 5: Add local render executor helper**

Add:

```ts
  private async maybeRenderVideoEditorExportLocally(
    request: VideoGenerationRequest,
    node: CompiledWorkflowNode,
    workflowRun: WorkflowRunRecord,
    context: WorkflowExecutionContext,
  ): Promise<{ cleanupDir: string | null; result: AiGatewayMediaResult } | null> {
    const renderPlanInput = readVideoEditorExportRenderPlan(request);
    if (!renderPlanInput) {
      return null;
    }

    const routeKey = resolveVideoRequestRouteKey(node.config ?? {});
    const capability = await withTenantTransaction(
      { tenantId: context.tenantId, userId: null },
      async (client) => this.loadVideoEditorRenderRouteCapability(client, context.tenantId, routeKey),
      this.pool,
    );
    if (capability?.renderEngine !== VIDEO_EDITOR_FFMPEG_RENDER_ENGINE) {
      return null;
    }

    const plan = buildVideoEditorRenderPlan(readVideoEditorConfig(node.config ?? {}) ?? renderPlanInput);
    const assetLookups = await withTenantTransaction(
      { tenantId: context.tenantId, userId: null },
      async (client) => this.loadAssetStorageLookups(client, context.tenantId, plan.assetIds),
      this.pool,
    );
    const renderResult = await this.videoEditorLocalRenderService.render({
      assetLookups: assetLookups as Map<string, VideoEditorRenderAssetLookup>,
      plan,
      tenantId: context.tenantId,
      workflowRunId: workflowRun.id,
    });
    return {
      cleanupDir: localOutputDirFromRenderResult(renderResult),
      result: {
        modelKey: "video-editor-ffmpeg",
        outputs: [renderResult.output],
        providerKey: "local",
        providerRequest: { renderEngine: VIDEO_EDITOR_FFMPEG_RENDER_ENGINE },
        providerResponse: { status: "rendered" },
        routeKey,
        status: "succeeded",
        usage: null,
      },
    };
  }
```

Use a type conversion or mapping if `AssetStorageLookup` has extra fields; the local render service only needs `bucket`, `objectKey`, and `mimeType`.

- [ ] **Step 6: Wire `video.generate` execution**

In the `video.generate` branch, after building `request`, call local renderer first:

```ts
      const localRenderOutcome = await this.maybeRenderVideoEditorExportLocally(request, node, workflowRun, context);
      if (localRenderOutcome) {
        return {
          cleanupDir: localRenderOutcome.cleanupDir,
          kind: "video",
          node,
          nodeRun,
          result: localRenderOutcome.result,
          runtimeFlow,
          type: "media_provider_succeeded",
          workflowRun,
        };
      }
```

Extend `MediaProviderOutcome` with:

```ts
  cleanupDir?: string | null;
```

Avoid calling `hydrateInputAssetUrls` before the local-render check; local rendering must use storage `getObject`, not signed URLs.

- [ ] **Step 7: Clean up local output directory after persistence**

In `finalizeNodeExecutionInTransaction`, wrap `mapMediaOutcome` for media outcomes with:

```ts
      let resolvedOutcome: NodeExecutionOutcome;
      if (outcome.type === "media_provider_succeeded") {
        try {
          resolvedOutcome = await this.mapMediaOutcome(...);
        } finally {
          if (outcome.cleanupDir) {
            await rm(outcome.cleanupDir, { force: true, recursive: true });
          }
        }
      } else {
        resolvedOutcome = outcome;
      }
```

This ensures local rendered output files survive until asset persistence reads them, then disappear whether persistence succeeds or fails.

- [ ] **Step 8: Run worker tests to verify green**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/worker.test.ts
```

Expected: PASS, with DB-backed tests skipped only if local DB env is unavailable.

### Task 3: Validation, Record, Commit

**Files:**
- Modify: `PROJECT_RECORD.md`
- Track: `docs/superpowers/plans/2026-07-05-video-editor-local-render-workflow-phase-23.md`

- [ ] **Step 1: Run focused worker tests**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/worker.test.ts test/video-editor-local-render-service.test.ts test/video-editor-ffmpeg-executor.test.ts test/video-editor-render-plan.test.ts test/media-asset-store.test.ts
```

Expected: PASS, with existing DB-backed worker tests skipped only when the local DB guard skips them.

- [ ] **Step 2: Run worker build**

Run:

```bash
npm run build --workspace @aigc-flow/worker
```

Expected: PASS.

- [ ] **Step 3: Run root build**

Run:

```bash
npm run build
```

Expected: PASS, allowing existing Browserslist, dynamic-import, and chunk-size warnings.

- [ ] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Update project record**

Prepend `2026-07-05 - Video Editor Local Render Workflow Phase 23` summarizing:

- route-enabled local FFmpeg rendering for video-editor exports.
- internal render engine is read from server-side route config only.
- provider fallback/guard remains for routes without `videoEditorRenderEngine: "ffmpeg"`.
- outputs are persisted as normal assets and local output dirs are cleaned after persistence.
- no new pricing unit, frontend export shortcut, database schema change, provider secret exposure, or browser-local authoritative storage was added.
- validation commands and outcomes.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/worker/src/workflow-runtime/service.ts apps/worker/test/worker.test.ts PROJECT_RECORD.md docs/superpowers/plans/2026-07-05-video-editor-local-render-workflow-phase-23.md
git commit -m "feat: wire video editor local render workflow"
```
