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

  test("keeps the current image node prompt when upstream image outputs include their original prompt", () => {
    const request = __workerTestUtils.buildImageRequest(
      [
        {
          assets: [
            {
              assetId: "asset-reference",
              kind: "image",
              mimeType: "image/png",
            },
          ],
          prompt: "动物运动会，3D风格",
        },
      ],
      {
        generationPrompt: "狮子在斑马的后面，斑马是第一名",
        params: {
          size: "4K",
        },
        routeKey: "image.mouxihub.nano-banana-pro.t3",
      },
    );

    expect(request.prompt).toBe("狮子在斑马的后面，斑马是第一名");
    expect(request.inputAssets).toEqual([
      expect.objectContaining({
        assetId: "asset-reference",
        kind: "image",
      }),
    ]);
  });

  test("combines upstream text with current prompt and ignores reference image prompt", () => {
    const request = __workerTestUtils.buildImageRequest(
      [
        {
          text: "Animal sports day, 3D style",
        },
        {
          assets: [
            {
              assetId: "asset-reference",
              kind: "image",
              mimeType: "image/png",
            },
          ],
          prompt: "old reference image prompt",
          text: "old reference image text",
        },
      ],
      {
        generationPrompt: "The lion is behind the zebra, and the zebra is first place",
        params: {
          size: "4K",
        },
        routeKey: "image.mouxihub.nano-banana-pro.t3",
      },
    );

    expect(request.prompt).toBe(
      "Animal sports day, 3D style\nThe lion is behind the zebra, and the zebra is first place",
    );
    expect(request.prompt).not.toContain("old reference image prompt");
    expect(request.prompt).not.toContain("old reference image text");
    expect(request.inputAssets).toEqual([
      expect.objectContaining({
        assetId: "asset-reference",
        kind: "image",
      }),
    ]);
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

  test("forwards image edit request metadata for target-node edit runs", () => {
    const request = __workerTestUtils.buildImageRequest(
      [
        {
          assets: [
            {
              assetId: "asset-source",
              kind: "image",
              mimeType: "image/png",
            },
          ],
        },
      ],
      {
        generationPrompt: "Remove the selected area",
        imageEditRequest: {
          editType: "erase",
          sourceNodeId: "source-node",
        },
        params: {
          mask: "data:image/png;base64,mask",
        },
        routeKey: "image.default",
      },
    );

    expect(request.inputAssets).toEqual([
      expect.objectContaining({
        assetId: "asset-source",
        kind: "image",
        mimeType: "image/png",
      }),
    ]);
    expect(request.metadata).toMatchObject({
      imageEditRequest: {
        editType: "erase",
        sourceNodeId: "source-node",
      },
      params: expect.objectContaining({
        mask: "data:image/png;base64,mask",
      }),
    });
  });

  test("uses imageEditRequest routeKey when the top-level routeKey is missing", () => {
    const request = __workerTestUtils.buildImageRequest(
      [
        {
          assets: [
            {
              assetId: "asset-source",
              kind: "image",
              mimeType: "image/png",
            },
          ],
        },
      ],
      {
        generationPrompt: "Generate a new angle of the same subject",
        imageEditRequest: {
          editType: "multiAngle",
          routeKey: "image.pixellelabs.nano-banana-pro",
          sourceNodeId: "source-node",
        },
        modelId: "pixellelabs.nano-banana-pro",
      },
    );

    expect(request.routeKey).toBe("image.pixellelabs.nano-banana-pro");
    expect(request.model).toBe("pixellelabs.nano-banana-pro");
  });

  test("resolves nested routeKey for runtime diagnostics", () => {
    expect(__workerTestUtils.resolveImageRequestRouteKey({
      imageEditRequest: {
        routeKey: " image.pixellelabs.nano-banana-pro ",
      },
    })).toBe("image.pixellelabs.nano-banana-pro");

    expect(__workerTestUtils.buildAiRuntimeDiagnostic({
      modelKey: "pixellelabs.nano-banana-pro",
      providerKey: "pixellelabs",
      routeKey: __workerTestUtils.resolveImageRequestRouteKey({
        imageEditRequest: {
          routeKey: "image.pixellelabs.nano-banana-pro",
        },
      }),
    })).toMatchObject({
      modelKey: "pixellelabs.nano-banana-pro",
      providerKey: "pixellelabs",
      routeKey: "image.pixellelabs.nano-banana-pro",
    });
  });
});
