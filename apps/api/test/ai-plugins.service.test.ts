import { describe, expect, test } from "vitest";

import { mouxiHubGptImage2Line3Manifest } from "../../../packages/ai-gateway-core/src/plugins/manifests/mouxihub-gpt-image-2-line3.js";
import { mouxiHubGptImage2Line4Manifest } from "../../../packages/ai-gateway-core/src/plugins/manifests/mouxihub-gpt-image-2-line4.js";
import { mouxiHubNanoBananaProT3Manifest } from "../../../packages/ai-gateway-core/src/plugins/manifests/mouxihub-nano-banana-pro-t3.js";
import { siphonLabGpt55TextManifest } from "../../../packages/ai-gateway-core/src/plugins/manifests/siphonlab-gpt-5-5-text.js";
import { tapflowVideoEditorFfmpegManifest } from "../../../packages/ai-gateway-core/src/plugins/manifests/tapflow-video-editor-ffmpeg.js";
import { AiPluginService } from "../src/modules/ai-plugins/ai-plugins.service.js";

describe("AiPluginService route install statements", () => {
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
});
