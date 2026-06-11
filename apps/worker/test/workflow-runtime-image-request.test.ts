import { describe, expect, test } from "vitest";

import { __workerTestUtils } from "../src/workflow-runtime/service.js";

describe("buildImageRequest", () => {
  test("forwards node referenceImages into provider-facing metadata", () => {
    const request = __workerTestUtils.buildImageRequest(
      [{ prompt: "upstream prompt" }],
      {
        generationPrompt: "@Image 1 turn it into a movie poster",
        referenceImages: [
          "https://cdn.test/reference-a.png",
          "https://cdn.test/reference-b.png",
          "",
        ],
        routeKey: "image.default",
      },
    );

    expect(request.metadata).toMatchObject({
      referenceImages: [
        "https://cdn.test/reference-a.png",
        "https://cdn.test/reference-b.png",
      ],
    });
  });
});
