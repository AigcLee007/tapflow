import { describe, expect, test } from "vitest";

import { AiPluginService } from "../src/modules/ai-plugins/ai-plugins.service.js";
import { mouxiHubNanoBananaProT3Manifest } from "../../../packages/ai-gateway-core/src/plugins/manifests/mouxihub-nano-banana-pro-t3.js";

describe("AiPluginService route install statements", () => {
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
    expect(statement.sql).not.toContain("$9::jsonb");
    expect(statement.sql).toContain("$9,\n            $10::jsonb,\n            $11::jsonb");
    expect(statement.sql).toContain("$12,\n            $13::uuid,\n            $14");
    expect(statement.sql).not.toContain("$14::uuid");

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
});
