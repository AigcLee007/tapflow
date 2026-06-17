import { describe, expect, test } from "vitest";

import { createWorkbenchGenerationSchema } from "../src/modules/workbench/workbench.schemas.js";

describe("workbench schemas", () => {
  test("accepts a valid workbench generation request", () => {
    const parsed = createWorkbenchGenerationSchema.parse({
      displayMode: "merged",
      modelId: "pixellelabs.nano-banana-pro",
      params: {
        aspect_ratio: "1:1",
        imageSize: "1K",
      },
      prompt: "product poster, clean background",
      referenceAssetIds: [],
      requestedCount: 2,
      routeKey: "image.pixellelabs.nano-banana-pro",
    });

    expect(parsed.displayMode).toBe("merged");
    expect(parsed.requestedCount).toBe(2);
  });

  test("rejects an empty prompt", () => {
    expect(() =>
      createWorkbenchGenerationSchema.parse({
        modelId: "gpt-image-2",
        params: {},
        prompt: " ",
        referenceAssetIds: [],
        requestedCount: 1,
        routeKey: "image.gpt-image-2",
      }),
    ).toThrow();
  });
});
