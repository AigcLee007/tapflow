# Video Editor FFmpeg Route Template Phase 24 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an installable built-in AI Gateway plugin template for the server-side FFmpeg video editor export route.

**Architecture:** Reuse the existing plugin manifest registry and admin install service. The new package creates a video catalog model, a `video.editor.ffmpeg` route, and `video_generation` pricing whose route request config declares the internal FFmpeg render capability already consumed by the worker.

**Tech Stack:** TypeScript, Vitest, AI Gateway plugin manifests, Fastify API plugin install service, Postgres-backed integration test.

---

## File Structure

- Create `packages/ai-gateway-core/src/plugins/manifests/tapflow-video-editor-ffmpeg.ts`: built-in manifest for the local FFmpeg video editor export route.
- Modify `packages/ai-gateway-core/src/plugins/registry.ts`: import and register the new manifest.
- Modify `packages/ai-gateway-core/test/plugin-registry.test.ts`: prove the manifest is listed, valid, and exposes the exact route capabilities needed by the worker.
- Modify `apps/api/test/ai-plugins.test.ts`: prove installing the package persists route config, catalog, pricing, normalized route fields, and no raw secret leak.
- Modify `PROJECT_RECORD.md`: record Phase 24 behavior and validation evidence.
- Create this plan file for the implementation trace.

## Task 1: Registry Manifest Coverage

**Files:**
- Modify: `packages/ai-gateway-core/test/plugin-registry.test.ts`

- [ ] **Step 1: Write the failing registry test**

Add this test after `lists built-in plugin manifests`:

```ts
  test("returns TapFlow video editor FFmpeg export manifest", () => {
    const manifest = builtinAiPluginRegistry.require("tapflow.video-editor-ffmpeg");

    expect(manifest.displayName).toBe("Video Editor FFmpeg Export");
    expect(manifest.modality).toBe("video");
    expect(manifest.provider).toMatchObject({
      defaultBaseUrl: "internal://tapflow-video-renderer",
      key: "tapflow-local-render",
      kind: "mock",
    });
    expect(manifest.credentials.fields).toEqual([]);
    expect(manifest.models).toEqual([
      expect.objectContaining({
        defaultRouteKey: "video.editor.ffmpeg",
        displayName: "Video Editor FFmpeg",
        modality: "video",
        modelFamily: "tapflow.video-editor",
        modelKey: "video-editor-ffmpeg",
      }),
    ]);
    expect(manifest.routes).toEqual([
      expect.objectContaining({
        mode: "sync",
        modelFamily: "tapflow.video-editor",
        modelKey: "video-editor-ffmpeg",
        path: "/internal/video-editor/render",
        requestConfig: expect.objectContaining({
          apiMode: "internal-render",
          capabilities: {
            supportedVideoWorkflows: ["video_editor_export"],
            videoEditorRenderEngine: "ffmpeg",
          },
          path: "/internal/video-editor/render",
        }),
        routeKey: "video.editor.ffmpeg",
        routeLabel: "FFmpeg Export",
      }),
    ]);
    expect(manifest.pricing).toEqual([
      expect.objectContaining({
        minChargeCredits: 50,
        model: "video-editor-ffmpeg",
        provider: "tapflow-local-render",
        route: "video.editor.ffmpeg",
        unit: "video_generation",
        unitCredits: 50,
      }),
    ]);
  });
```

- [ ] **Step 2: Update the built-in list expectation**

Add `"tapflow.video-editor-ffmpeg"` to the expected `packageKey` list and change the manifest count from `8` to `9`.

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts
```

Expected: FAIL with `Plugin package not found: tapflow.video-editor-ffmpeg` or a list mismatch.

## Task 2: Add Built-In Manifest

**Files:**
- Create: `packages/ai-gateway-core/src/plugins/manifests/tapflow-video-editor-ffmpeg.ts`
- Modify: `packages/ai-gateway-core/src/plugins/registry.ts`

- [ ] **Step 1: Implement the manifest**

Create:

```ts
import type { AiPluginManifest } from "../plugin-manifest.js";

export const tapflowVideoEditorFfmpegManifest: AiPluginManifest = {
  credentials: {
    fields: [],
    type: "bearer",
  },
  description: "TapFlow server-side FFmpeg export route for canvas video editor timelines.",
  displayName: "Video Editor FFmpeg Export",
  modality: "video",
  models: [
    {
      capabilities: {
        supportedAspectRatios: ["16:9", "9:16", "1:1"],
        supportedSizes: ["1280x720", "1920x1080", "1080x1920", "1080x1080"],
      },
      defaultRouteKey: "video.editor.ffmpeg",
      displayName: "Video Editor FFmpeg",
      modality: "video",
      modelFamily: "tapflow.video-editor",
      modelKey: "video-editor-ffmpeg",
      sortOrder: 70,
      uiSchema: {
        fields: [],
        panelLayout: "video",
      },
    },
  ],
  packageKey: "tapflow.video-editor-ffmpeg",
  pricing: [
    {
      metadata: {
        billingContext: "video_editor_export",
        internalRenderEngine: "ffmpeg",
        source: "tapflow-video-editor-ffmpeg",
      },
      minChargeCredits: 50,
      model: "video-editor-ffmpeg",
      provider: "tapflow-local-render",
      route: "video.editor.ffmpeg",
      unit: "video_generation",
      unitCredits: 50,
    },
  ],
  provider: {
    capabilities: {
      internalRender: true,
      supportedVideoWorkflows: ["video_editor_export"],
      videoEditorRenderEngine: "ffmpeg",
    },
    defaultBaseUrl: "internal://tapflow-video-renderer",
    key: "tapflow-local-render",
    kind: "mock",
    name: "TapFlow Local Renderer",
  },
  routes: [
    {
      mode: "sync",
      modality: "video",
      modelFamily: "tapflow.video-editor",
      modelKey: "video-editor-ffmpeg",
      path: "/internal/video-editor/render",
      priority: 30,
      requestConfig: {
        apiMode: "internal-render",
        capabilities: {
          supportedVideoWorkflows: ["video_editor_export"],
          videoEditorRenderEngine: "ffmpeg",
        },
        internalRender: true,
        path: "/internal/video-editor/render",
        timeoutMs: 300000,
      },
      routeKey: "video.editor.ffmpeg",
      routeLabel: "FFmpeg Export",
      timeoutMs: 300000,
    },
  ],
  tests: [
    {
      expected: {
        status: "succeeded",
      },
      key: "video-editor-export",
      label: "Video editor export manifest smoke",
      request: {
        metadata: {
          videoEditorExport: {
            source: "video_editor_export",
          },
        },
        prompt: "Export a saved video editor timeline.",
      },
      routeKey: "video.editor.ffmpeg",
    },
  ],
  version: "1.0.0",
};
```

- [ ] **Step 2: Register the manifest**

Import it in `registry.ts`:

```ts
import { tapflowVideoEditorFfmpegManifest } from "./manifests/tapflow-video-editor-ffmpeg.js";
```

Add it to `BUILTIN_AI_PLUGIN_MANIFESTS`.

- [ ] **Step 3: Run registry tests**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts
```

Expected: PASS.

## Task 3: API Install Coverage

**Files:**
- Modify: `apps/api/test/ai-plugins.test.ts`

- [ ] **Step 1: Write the failing install test**

Add a second DB-backed test inside `describeWithDatabase("ai plugin admin API", ...)`:

```ts
  test("installs the internal video editor FFmpeg export plugin", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const api = buildTestApp(appPool);
        const owner = await registerOwner(api, "video-plugin-owner@example.com", "Video Plugin Owner");

        const install = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            publishImmediately: true,
          },
          url: "/api/v2/admin/ai/plugins/tapflow.video-editor-ffmpeg/install",
        });

        expect(install.statusCode).toBe(201);
        expect(install.json()).toMatchObject({
          catalogModelKeys: ["video-editor-ffmpeg"],
          packageKey: "tapflow.video-editor-ffmpeg",
          routeKeys: ["video.editor.ffmpeg"],
          status: "published",
        });
        expect(install.json().credentialId).toBeNull();

        const dbState = await adminPool.query<{
          catalog_default_route_key: string | null;
          connection_adapter_kind: string | null;
          connection_base_url: string | null;
          credential_count: string;
          pricing_count: string;
          route_api_mode: string | null;
          route_capabilities: Record<string, unknown> | null;
          route_path: string | null;
          route_upstream_model: string | null;
        }>(
          `
            SELECT
              (
                SELECT default_route_key
                FROM ai_model_catalog
                WHERE plugin_install_id = $1::uuid
                  AND model_key = 'video-editor-ffmpeg'
                LIMIT 1
              ) AS catalog_default_route_key,
              (
                SELECT adapter_kind
                FROM ai_provider_connections
                WHERE provider_id = (SELECT provider_id FROM tenant_ai_plugin_installs WHERE id = $1::uuid)
                LIMIT 1
              ) AS connection_adapter_kind,
              (
                SELECT base_url
                FROM ai_provider_connections
                WHERE provider_id = (SELECT provider_id FROM tenant_ai_plugin_installs WHERE id = $1::uuid)
                LIMIT 1
              ) AS connection_base_url,
              (
                SELECT COUNT(*)::text
                FROM api_credentials
                WHERE provider_id = (SELECT provider_id FROM tenant_ai_plugin_installs WHERE id = $1::uuid)
              ) AS credential_count,
              (
                SELECT COUNT(*)::text
                FROM model_pricing
                WHERE provider = 'tapflow-local-render'
                  AND model = 'video-editor-ffmpeg'
                  AND route = 'video.editor.ffmpeg'
                  AND unit = 'video_generation'
                  AND active = true
              ) AS pricing_count,
              (
                SELECT api_mode
                FROM ai_routes
                WHERE plugin_install_id = $1::uuid
                  AND route_key = 'video.editor.ffmpeg'
                LIMIT 1
              ) AS route_api_mode,
              (
                SELECT request_config->'capabilities'
                FROM ai_routes
                WHERE plugin_install_id = $1::uuid
                  AND route_key = 'video.editor.ffmpeg'
                LIMIT 1
              ) AS route_capabilities,
              (
                SELECT request_path
                FROM ai_routes
                WHERE plugin_install_id = $1::uuid
                  AND route_key = 'video.editor.ffmpeg'
                LIMIT 1
              ) AS route_path,
              (
                SELECT upstream_model
                FROM ai_routes
                WHERE plugin_install_id = $1::uuid
                  AND route_key = 'video.editor.ffmpeg'
                LIMIT 1
              ) AS route_upstream_model
          `,
          [install.json().id],
        );

        expect(dbState.rows[0]).toEqual({
          catalog_default_route_key: "video.editor.ffmpeg",
          connection_adapter_kind: "mock",
          connection_base_url: "internal://tapflow-video-renderer",
          credential_count: "0",
          pricing_count: "1",
          route_api_mode: "internal-render",
          route_capabilities: {
            supportedVideoWorkflows: ["video_editor_export"],
            videoEditorRenderEngine: "ffmpeg",
          },
          route_path: "/internal/video-editor/render",
          route_upstream_model: "video-editor-ffmpeg",
        });

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
```

- [ ] **Step 2: Run API test**

Run:

```bash
npm run test --workspace @aigc-flow/api -- test/ai-plugins.test.ts
```

Expected without DB env: SKIP due existing guard. Expected with DB env before implementation: FAIL with `PLUGIN_NOT_FOUND`.

## Task 4: Documentation And Verification

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update project record**

Add a top entry for Phase 24 describing the installable FFmpeg export plugin, the billing unit, no new env vars, no DB migration, and validation results.

- [ ] **Step 2: Run verification**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts
npm run test --workspace @aigc-flow/api -- test/ai-plugins.test.ts
npm run build --workspace @aigc-flow/ai-gateway-core
npm run build --workspace @aigc-flow/api
npm run build
git diff --check
```

Expected: registry tests and builds pass; API test may skip DB-backed tests when local DB env is absent.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-07-06-video-editor-ffmpeg-route-template-phase-24.md packages/ai-gateway-core/src/plugins/manifests/tapflow-video-editor-ffmpeg.ts packages/ai-gateway-core/src/plugins/registry.ts packages/ai-gateway-core/test/plugin-registry.test.ts apps/api/test/ai-plugins.test.ts PROJECT_RECORD.md
git commit -m "feat: add video editor ffmpeg route template"
```
