import { describe, expect, test } from "vitest";

import { mouxiHubGptImage2Line3Manifest } from "../../../packages/ai-gateway-core/src/plugins/manifests/mouxihub-gpt-image-2-line3.js";
import { mouxiHubGptImage2Line4Manifest } from "../../../packages/ai-gateway-core/src/plugins/manifests/mouxihub-gpt-image-2-line4.js";
import { mouxiHubNanoBananaProT3Manifest } from "../../../packages/ai-gateway-core/src/plugins/manifests/mouxihub-nano-banana-pro-t3.js";
import { openAiGptImage2Manifest } from "../../../packages/ai-gateway-core/src/plugins/manifests/openai-gpt-image-2.js";
import { siphonLabGpt55TextManifest } from "../../../packages/ai-gateway-core/src/plugins/manifests/siphonlab-gpt-5-5-text.js";
import { aittcoTextRelayManifest } from "../../../packages/ai-gateway-core/src/plugins/manifests/aittco-text-relay.js";
import { pixelHubVideoManifest } from "../../../packages/ai-gateway-core/src/plugins/manifests/pixelhub-video.js";
import { tapflowVideoEditorFfmpegManifest } from "../../../packages/ai-gateway-core/src/plugins/manifests/tapflow-video-editor-ffmpeg.js";
import { AiPluginService } from "../src/modules/ai-plugins/ai-plugins.service.js";

describe("AiPluginService route install statements", () => {
  test("requires a base URL when installing the PixelHub package", async () => {
    const service = new AiPluginService({ credentialVault: {} as never, pool: {} as never });
    await expect(service.installPlugin(
      { tenantId: "tenant", userId: null },
      "pixelhub.video",
      {},
    )).rejects.toMatchObject({ code: "PLUGIN_BASE_URL_REQUIRED", statusCode: 422 });
  });

  test("fails closed when a route-scoped credential binding is missing", () => {
    const service = new AiPluginService({ credentialVault: {} as never, pool: {} as never });

    const resolve = () => (
      service as unknown as {
        resolveCredentialBindingInputs: (
          manifest: typeof pixelHubVideoManifest,
          input: { credentials?: Record<string, { secret?: string }> },
        ) => unknown;
      }
    ).resolveCredentialBindingInputs(pixelHubVideoManifest, {
      credentials: {
        "gemini-omni-flash": { secret: "gemini-test-secret" },
        "sora-v3-pro": { secret: "sora-test-secret" },
      },
    });

    try {
      resolve();
      throw new Error("Expected missing PixelHub credentials to be rejected");
    } catch (error) {
      expect(error).toMatchObject({ code: "PLUGIN_CREDENTIAL_BINDINGS_INCOMPLETE", statusCode: 422 });
    }
  });

  test("fails closed when a route-scoped manifest leaves a route unbound", () => {
    const service = new AiPluginService({ credentialVault: {} as never, pool: {} as never });
    const malformed = {
      ...pixelHubVideoManifest,
      credentialBindings: [pixelHubVideoManifest.credentialBindings![0]],
    };

    expect(() => (
      service as unknown as {
        resolveCredentialBindingInputs: (manifest: typeof malformed, input: { credentials: Record<string, { secret: string }> }) => unknown;
      }
    ).resolveCredentialBindingInputs(malformed, {
      credentials: { "gemini-omni-flash": { secret: "gemini-test-secret" } },
    })).toThrow(expect.objectContaining({ code: "PLUGIN_CREDENTIAL_BINDINGS_INCOMPLETE" }));
  });

  test("declares one stable PixelHub credential binding per route", () => {
    expect(pixelHubVideoManifest.credentialBindings).toEqual([
      expect.objectContaining({ bindingKey: "gemini-omni-flash", modelKey: "gemini-omni-flash", routeKey: "video.pixelhub.gemini-omni-flash" }),
      expect.objectContaining({ bindingKey: "sora-v3-pro", modelKey: "sora-v3-pro", routeKey: "video.pixelhub.sora-v3-pro" }),
      expect.objectContaining({ bindingKey: "veo31-fast", modelKey: "veo31-fast", routeKey: "video.pixelhub.veo31-fast" }),
    ]);
  });

  test("keeps the legacy single credential install input", () => {
    const service = new AiPluginService({ credentialVault: {} as never, pool: {} as never });

    expect((
      service as unknown as {
        resolveCredentialBindingInputs: (
          manifest: typeof openAiGptImage2Manifest,
          input: { credential?: { secret?: string } },
        ) => unknown;
      }
    ).resolveCredentialBindingInputs(openAiGptImage2Manifest, {
      credential: { secret: "legacy-test-secret" },
    })).toEqual({ kind: "legacy", input: { secret: "legacy-test-secret" } });
  });

  test("locks and validates an existing platform credential before plugin reuse", async () => {
    const service = new AiPluginService({ credentialVault: {} as never, pool: {} as never });
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const client = { async query(sql: string, values: unknown[]) {
      queries.push({ sql, values });
      return { rows: [{ id: "00000000-0000-0000-0000-000000000004" }] };
    } };
    const resolved = await (service as unknown as { resolveCredentialId(
      client: typeof client, context: { tenantId: string; userId: null }, manifest: typeof openAiGptImage2Manifest,
      providerId: string, existingCredentialId: string, input: Record<string, never>): Promise<string> }).resolveCredentialId(
      client, { tenantId: "tenant", userId: null }, openAiGptImage2Manifest,
      "00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000004", {},
    );
    expect(resolved).toBe("00000000-0000-0000-0000-000000000004");
    expect(queries[0].sql).toContain("FOR KEY SHARE");
    expect(queries[0].sql).toContain("tenant_id IS NULL");
    expect(queries[0].sql).toContain("provider_id = $2::uuid");
    expect(queries[0].sql).toContain("status = 'active'");
  });

  test("rejects missing inactive or mismatched reused plugin credential", async () => {
    const service = new AiPluginService({ credentialVault: {} as never, pool: {} as never });
    const client = { async query() { return { rows: [] }; } };
    await expect((service as unknown as { resolveCredentialId(...args: unknown[]): Promise<string> }).resolveCredentialId(
      client, { tenantId: "tenant", userId: null }, openAiGptImage2Manifest,
      "00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000004", {},
    )).rejects.toMatchObject({ code: "PLUGIN_CREDENTIAL_UNAVAILABLE", statusCode: 409 });
  });

  test("marks credential-free video editor FFmpeg plugin summaries as not requiring credentials", () => {
    const service = new AiPluginService({
      credentialVault: {} as never,
      pool: {} as never,
    });

    const summary = (
      service as unknown as {
        mapManifestSummary: (
          manifest: typeof tapflowVideoEditorFfmpegManifest,
          install: null,
        ) => {
          credentials: {
            fields: unknown[];
            required: boolean;
            type: string;
          };
          packageKey: string;
        };
      }
    ).mapManifestSummary(tapflowVideoEditorFfmpegManifest, null);

    expect(summary).toMatchObject({
      credentials: {
        fields: [],
        required: false,
        type: "bearer",
      },
      packageKey: "tapflow.video-editor-ffmpeg",
    });
  });

  test("uses provider adapter kind for MouxiHub T3 connection instead of async route mode", async () => {
    const service = new AiPluginService({
      credentialVault: {} as never,
      pool: {} as never,
    });
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      async query(sql: string, values: unknown[]) {
        queries.push({ sql, values });
        return { rows: [{ id: "00000000-0000-0000-0000-000000000007" }] };
      },
    };

    await (
      service as unknown as {
        upsertProviderConnection: (
          client: typeof client,
          options: {
            context: { tenantId: string; userId: string | null };
            credentialId: string | null;
            input: { baseUrlOverride?: string | null };
            installId: string;
            manifest: typeof mouxiHubNanoBananaProT3Manifest;
            providerId: string;
          },
        ) => Promise<string | null>;
      }
    ).upsertProviderConnection(client, {
      context: { tenantId: "tenant-1", userId: null },
      credentialId: "00000000-0000-0000-0000-000000000004",
      input: {},
      installId: "00000000-0000-0000-0000-000000000006",
      manifest: mouxiHubNanoBananaProT3Manifest,
      providerId: "00000000-0000-0000-0000-000000000002",
    });

    expect(queries[0]?.values[4]).toBe("openai-compatible");
    expect(queries[0]?.values[4]).not.toBe("async");
  });

  test("uses package-scoped connection names so split GPT-Image-2 templates do not reuse one connection", async () => {
    const service = new AiPluginService({
      credentialVault: {} as never,
      pool: {} as never,
    });
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      async query(sql: string, values: unknown[]) {
        queries.push({ sql, values });
        return { rows: [{ id: "00000000-0000-0000-0000-000000000017" }] };
      },
    };

    await (
      service as unknown as {
        upsertProviderConnection: (
          client: typeof client,
          options: {
            context: { tenantId: string; userId: string | null };
            credentialId: string | null;
            input: { baseUrlOverride?: string | null };
            installId: string;
            manifest: typeof mouxiHubGptImage2Line3Manifest;
            providerId: string;
          },
        ) => Promise<string | null>;
      }
    ).upsertProviderConnection(client, {
      context: { tenantId: "tenant-1", userId: null },
      credentialId: "00000000-0000-0000-0000-000000000014",
      input: {},
      installId: "00000000-0000-0000-0000-000000000016",
      manifest: mouxiHubGptImage2Line3Manifest,
      providerId: "00000000-0000-0000-0000-000000000012",
    });

    expect(queries[0]?.values[3]).toBe("GPT-Image-2 线路三 (mouxihub.gpt-image-2-line3) Connection");
  });

  test("builds aligned ai_routes insert parameters for MouxiHub T3 async route", () => {
    const service = new AiPluginService({
      credentialVault: {} as never,
      pool: {} as never,
    });
    const route = mouxiHubNanoBananaProT3Manifest.routes[0];
    const requestConfig = {
      ...route.requestConfig,
      mode: route.mode,
      path: route.path ?? route.requestConfig.path,
      timeoutMs: route.timeoutMs,
    };

    const statement = (
      service as unknown as {
        buildRouteInsertStatement: (options: {
          baseUrlOverride: string | null;
          connectionId: string | null;
          credentialId: string | null;
          installId: string;
          modelId: string;
          providerId: string;
          requestConfig: Record<string, unknown>;
          route: typeof route;
          status: string;
          tenantId: string | null;
        }) => { sql: string; values: unknown[] };
      }
    ).buildRouteInsertStatement({
      baseUrlOverride: "https://api.mouxihub.com",
      connectionId: "00000000-0000-0000-0000-000000000005",
      credentialId: "00000000-0000-0000-0000-000000000004",
      installId: "00000000-0000-0000-0000-000000000006",
      modelId: "00000000-0000-0000-0000-000000000003",
      providerId: "00000000-0000-0000-0000-000000000002",
      requestConfig,
      route,
      status: "active",
      tenantId: null,
    });

    const placeholders = Array.from(statement.sql.matchAll(/\$(\d+)/g), (match) => Number(match[1]));
    expect(Math.max(...placeholders)).toBe(19);
    expect(new Set(placeholders)).toEqual(new Set(Array.from({ length: 19 }, (_, index) => index + 1)));
    expect(statement.values).toHaveLength(19);

    expect(statement.values.slice(8, 19)).toEqual([
      "https://api.mouxihub.com",
      JSON.stringify(requestConfig),
      JSON.stringify(route.rateLimit ?? {}),
      "active",
      "00000000-0000-0000-0000-000000000006",
      "pixellelabs.nano-banana-pro",
      "线路二（官方T3）",
      "production",
      "gemini-3-pro-image-preview",
      "async",
      "/v1/images/generations",
    ]);
  });

  test("builds aligned ai_routes insert parameters for GPT-Image-2 line three template", () => {
    const service = new AiPluginService({
      credentialVault: {} as never,
      pool: {} as never,
    });
    const route = mouxiHubGptImage2Line3Manifest.routes[0];
    const requestConfig = {
      ...route.requestConfig,
      mode: route.mode,
      path: route.path ?? route.requestConfig.path,
      timeoutMs: route.timeoutMs,
    };

    const statement = (
      service as unknown as {
        buildRouteInsertStatement: (options: {
          baseUrlOverride: string | null;
          connectionId: string | null;
          credentialId: string | null;
          installId: string;
          modelId: string;
          providerId: string;
          requestConfig: Record<string, unknown>;
          route: typeof route;
          status: string;
          tenantId: string | null;
        }) => { sql: string; values: unknown[] };
      }
    ).buildRouteInsertStatement({
      baseUrlOverride: "https://api.mouxihub.com",
      connectionId: "00000000-0000-0000-0000-000000000015",
      credentialId: "00000000-0000-0000-0000-000000000014",
      installId: "00000000-0000-0000-0000-000000000016",
      modelId: "00000000-0000-0000-0000-000000000013",
      providerId: "00000000-0000-0000-0000-000000000012",
      requestConfig,
      route,
      status: "active",
      tenantId: null,
    });

    expect(statement.values.slice(8, 19)).toEqual([
      "https://api.mouxihub.com",
      JSON.stringify(requestConfig),
      JSON.stringify(route.rateLimit ?? {}),
      "active",
      "00000000-0000-0000-0000-000000000016",
      "gpt-image-2",
      "线路三",
      "production",
      "gpt-image-2",
      "async",
      "/v1/images/generations",
    ]);
  });

  test("persists GPT-Image-2 production image mode capabilities in route request config", () => {
    const service = new AiPluginService({
      credentialVault: {} as never,
      pool: {} as never,
    });
    const route = openAiGptImage2Manifest.routes[0];
    const requestConfig = {
      ...route.requestConfig,
      mode: route.mode,
      path: route.path ?? route.requestConfig.path,
      timeoutMs: route.timeoutMs,
    };

    const statement = (
      service as unknown as {
        buildRouteInsertStatement: (options: {
          baseUrlOverride: string | null;
          connectionId: string | null;
          credentialId: string | null;
          installId: string;
          modelId: string;
          providerId: string;
          requestConfig: Record<string, unknown>;
          route: typeof route;
          status: string;
          tenantId: string | null;
        }) => { sql: string; values: unknown[] };
      }
    ).buildRouteInsertStatement({
      baseUrlOverride: "https://sub.siphonlab.cn/v1",
      connectionId: "00000000-0000-0000-0000-000000000045",
      credentialId: "00000000-0000-0000-0000-000000000044",
      installId: "00000000-0000-0000-0000-000000000046",
      modelId: "00000000-0000-0000-0000-000000000043",
      providerId: "00000000-0000-0000-0000-000000000042",
      requestConfig,
      route,
      status: "active",
      tenantId: null,
    });

    const persistedRequestConfig = JSON.parse(String(statement.values[9])) as {
      capabilities?: {
        supportedGenerationModes?: string[];
      };
    };
    expect(persistedRequestConfig.capabilities?.supportedGenerationModes).toEqual([
      "standard",
      "panorama_360",
      "wraparound_270",
      "subject_orbit_270",
    ]);
  });

  test("publishes GPT-Image-2 panorama capability on catalog models themselves", () => {
    for (const manifest of [
      openAiGptImage2Manifest,
      mouxiHubGptImage2Line3Manifest,
      mouxiHubGptImage2Line4Manifest,
    ]) {
      expect(manifest.models[0].capabilities.supportedGenerationModes).toEqual([
        "standard",
        "panorama_360",
        "wraparound_270",
        "subject_orbit_270",
      ]);
    }
  });

  test("builds aligned ai_routes insert parameters for GPT-Image-2 line four template", () => {
    const service = new AiPluginService({
      credentialVault: {} as never,
      pool: {} as never,
    });
    const route = mouxiHubGptImage2Line4Manifest.routes[0];
    const requestConfig = {
      ...route.requestConfig,
      mode: route.mode,
      path: route.path ?? route.requestConfig.path,
      timeoutMs: route.timeoutMs,
    };

    const statement = (
      service as unknown as {
        buildRouteInsertStatement: (options: {
          baseUrlOverride: string | null;
          connectionId: string | null;
          credentialId: string | null;
          installId: string;
          modelId: string;
          providerId: string;
          requestConfig: Record<string, unknown>;
          route: typeof route;
          status: string;
          tenantId: string | null;
        }) => { sql: string; values: unknown[] };
      }
    ).buildRouteInsertStatement({
      baseUrlOverride: "https://api.mouxihub.com",
      connectionId: "00000000-0000-0000-0000-000000000025",
      credentialId: "00000000-0000-0000-0000-000000000024",
      installId: "00000000-0000-0000-0000-000000000026",
      modelId: "00000000-0000-0000-0000-000000000023",
      providerId: "00000000-0000-0000-0000-000000000022",
      requestConfig,
      route,
      status: "active",
      tenantId: null,
    });

    expect(statement.values.slice(8, 19)).toEqual([
      "https://api.mouxihub.com",
      JSON.stringify(requestConfig),
      JSON.stringify(route.rateLimit ?? {}),
      "active",
      "00000000-0000-0000-0000-000000000026",
      "gpt-image-2",
      "线路四",
      "production",
      "gpt-image-2",
      "async",
      "/v1/images/generations",
    ]);
  });

  test("builds aligned ai_routes insert parameters for GPT-5.5 text template", () => {
    const service = new AiPluginService({
      credentialVault: {} as never,
      pool: {} as never,
    });
    const route = siphonLabGpt55TextManifest.routes[0];
    const requestConfig = {
      ...route.requestConfig,
      mode: route.mode,
      path: route.path ?? route.requestConfig.path,
      timeoutMs: route.timeoutMs,
    };

    const statement = (
      service as unknown as {
        buildRouteInsertStatement: (options: {
          baseUrlOverride: string | null;
          connectionId: string | null;
          credentialId: string | null;
          installId: string;
          modelId: string;
          providerId: string;
          requestConfig: Record<string, unknown>;
          route: typeof route;
          status: string;
          tenantId: string | null;
        }) => { sql: string; values: unknown[] };
      }
    ).buildRouteInsertStatement({
      baseUrlOverride: "https://sub.siphonlab.cn",
      connectionId: "00000000-0000-0000-0000-000000000035",
      credentialId: "00000000-0000-0000-0000-000000000034",
      installId: "00000000-0000-0000-0000-000000000036",
      modelId: "00000000-0000-0000-0000-000000000033",
      providerId: "00000000-0000-0000-0000-000000000032",
      requestConfig,
      route,
      status: "active",
      tenantId: null,
    });

    expect(statement.values.slice(8, 19)).toEqual([
      "https://sub.siphonlab.cn",
      JSON.stringify(requestConfig),
      JSON.stringify(route.rateLimit ?? {}),
      "active",
      "00000000-0000-0000-0000-000000000036",
      "gpt-5.5",
      "默认线路",
      "production",
      "gpt-5.5",
      "sync",
      "/v1/chat/completions",
    ]);
  });

  test("persists the configured Aittco upstream model instead of the product model key", () => {
    const service = new AiPluginService({ credentialVault: {} as never, pool: {} as never });
    const route = aittcoTextRelayManifest.routes.find((item) => item.routeKey === "text.gemini-3-1-pro");
    expect(route).toBeDefined();
    const requestConfig = {
      ...route!.requestConfig,
      mode: route!.mode,
      path: route!.path ?? route!.requestConfig.path,
      timeoutMs: route!.timeoutMs,
    };
    const statement = (service as unknown as { buildRouteInsertStatement: (options: {
      baseUrlOverride: string | null;
      connectionId: string | null;
      credentialId: string | null;
      installId: string;
      modelId: string;
      providerId: string;
      requestConfig: Record<string, unknown>;
      route: NonNullable<typeof route>;
      status: string;
      tenantId: string | null;
    }) => { values: unknown[] } }).buildRouteInsertStatement({
      baseUrlOverride: "https://api.aittco.com",
      connectionId: "00000000-0000-0000-0000-000000000005",
      credentialId: "00000000-0000-0000-0000-000000000004",
      installId: "00000000-0000-0000-0000-000000000006",
      modelId: "00000000-0000-0000-0000-000000000003",
      providerId: "00000000-0000-0000-0000-000000000002",
      requestConfig,
      route: route!,
      status: "active",
      tenantId: null,
    });

    expect(statement.values[16]).toBe("gemini-3.1-pro-preview");
  });

  test("persists Aittco text image input capabilities on each route", () => {
    const capability = {
      maxImages: 3,
      supportedImageMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      supportsImageInput: true,
    };
    for (const route of aittcoTextRelayManifest.routes) {
      expect(route.requestConfig.capabilities).toEqual(capability);
    }
    for (const model of aittcoTextRelayManifest.models) {
      expect(model.capabilities).toEqual(expect.objectContaining(capability));
    }
  });
});
