import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  publishModelConfiguration,
  saveModelConfigurationDraft,
} from "./v2AiModelConfigurationsApi";
import { clearStoredAuth, setStoredTokens, V2HttpError } from "./v2HttpClient";

const routeId = "11111111-1111-4111-8111-111111111111";

describe("v2AiModelConfigurationsApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setStoredTokens({ accessToken: "test-token", refreshToken: "refresh-token" });
  });

  afterEach(() => {
    clearStoredAuth();
    vi.unstubAllGlobals();
  });

  test("saves a draft with the exact configuration payload", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      catalog: { id: "catalog-1", status: "inactive" },
      connection: { baseUrl: "https://api.example.com/", environment: "production", id: "connection-1", name: "Example", status: "inactive" },
      credential: { id: "credential-1", name: "Example key", secretFingerprint: "fingerprint", status: "active" },
      model: { displayName: "Example Image", id: "model-1", modality: "image", modelFamily: "example", modelKey: "example-image" },
      pricing: { active: false, minChargeCredits: 1, unit: "image_generation", unitCredits: 2 },
      route: { configurationRevision: 1, id: routeId, key: "example.image", status: "inactive", testedRevision: null },
    }), { headers: { "content-type": "application/json" }, status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      connection: { baseUrl: "https://api.example.com", environment: "production", mode: "create" as const, name: "Example" },
      credential: { mode: "create" as const, name: "Example key", secret: "secret-value" },
      packageKey: "example.image",
      pricing: { minChargeCredits: 1, unit: "image_generation" as const, unitCredits: 2 },
      route: { routeLabel: "Line 1", upstreamModel: "example-image" },
    };

    const saved = await saveModelConfigurationDraft(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/admin/ai/model-configurations/draft",
      expect.objectContaining({
        body: JSON.stringify(payload),
        method: "POST",
      }),
    );
    expect(saved.credential).toEqual({
      id: "credential-1",
      name: "Example key",
      secretFingerprint: "fingerprint",
      status: "active",
    });
  });

  test("publishes a tested draft with its expected revision", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), {
      headers: { "content-type": "application/json" },
      status: 200,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await publishModelConfiguration({ expectedRevision: 3, routeId });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/admin/ai/model-configurations/publish",
      expect.objectContaining({
        body: JSON.stringify({ expectedRevision: 3, routeId }),
        method: "POST",
      }),
    );
  });

  test("preserves structured API errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { code: "MODEL_CONFIGURATION_CONFLICT", message: "Model configuration changed; reload and retry" },
    }), { headers: { "content-type": "application/json" }, status: 409 })));

    await expect(publishModelConfiguration({ expectedRevision: 2, routeId })).rejects.toMatchObject({
      code: "MODEL_CONFIGURATION_CONFLICT",
      message: "Model configuration changed; reload and retry",
      status: 409,
    } satisfies Partial<V2HttpError>);
  });
});
