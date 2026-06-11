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

  test("builds target-node upstream outputs from static text and asset-backed image node configs", () => {
    const outputs = __workerTestUtils.getDependencyOutputs(
      {
        config: { batchCount: 2, routeKey: "image.default" },
        dependencies: ["prompt", "reference"],
        dependents: [],
        id: "image",
        type: "image.generate",
      },
      [],
      {
        compiled_graph_json: {
          edges: [
            { source: "prompt", target: "image" },
            { source: "reference", target: "image" },
          ],
          entryNodeIds: ["prompt", "reference"],
          nodes: [
            {
              config: { text: "一只黑色小猫" },
              dependencies: [],
              dependents: ["image"],
              id: "prompt",
              type: "text.static",
            },
            {
              config: {
                assetId: "asset-cat",
                mimeType: "image/png",
              },
              dependencies: [],
              dependents: ["image"],
              id: "reference",
              type: "image.asset",
            },
          ],
          outputNodeIds: ["image"],
          schemaVersion: "v2",
        },
      },
    );

    expect(outputs).toEqual([
      { text: "一只黑色小猫" },
      {
        assets: [
          expect.objectContaining({
            assetId: "asset-cat",
            kind: "image",
            mimeType: "image/png",
          }),
        ],
      },
    ]);
  });

  test("forwards batchCount as provider image count metadata", () => {
    const request = __workerTestUtils.buildImageRequest(
      [{ prompt: "a black kitten" }],
      {
        batchCount: 2,
        routeKey: "image.default",
      },
    );

    expect(request.metadata).toMatchObject({
      n: 2,
      params: expect.objectContaining({
        n: 2,
      }),
    });
  });
});
