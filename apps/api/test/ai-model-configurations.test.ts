import { describe, expect, test } from "vitest";

import {
  AiModelConfigurationApiError,
  AiModelConfigurationsService,
} from "../src/modules/ai-model-configurations/ai-model-configurations.service.js";

describe("AiModelConfigurationsService", () => {
  test("exposes stable service error details without leaking input secrets", () => {
    const error = new AiModelConfigurationApiError(
      409,
      "MODEL_CONFIGURATION_CONFLICT",
      "Model configuration changed",
    );

    expect(error).toMatchObject({
      code: "MODEL_CONFIGURATION_CONFLICT",
      message: "Model configuration changed",
      statusCode: 409,
    });
    expect(JSON.stringify(error)).not.toContain("secret");
  });

  test("rejects missing positive pricing before opening a transaction", async () => {
    const service = new AiModelConfigurationsService({
      credentialVault: {} as never,
      pluginRegistry: {} as never,
      pool: {
        connect() {
          throw new Error("transaction must not start");
        },
      } as never,
    });

    await expect(service.saveDraft(
      { tenantId: "00000000-0000-0000-0000-000000000001", userId: null },
      {
        packageKey: "pixellelabs.nano-banana-pro",
        connection: { mode: "existing", connectionId: "00000000-0000-0000-0000-000000000002" },
        credential: { mode: "existing", credentialId: "00000000-0000-0000-0000-000000000003" },
        pricing: { unit: "image_generation", unitCredits: 0, minChargeCredits: 0 },
        route: { routeLabel: "Line one", upstreamModel: "gemini-3-pro-image-preview" },
      } as never,
    )).rejects.toMatchObject({ code: "CONFIGURATION_PRICING_REQUIRED", statusCode: 400 });
  });
});
