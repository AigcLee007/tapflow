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

  test("combines current image prompt with text from upstream image outputs", () => {
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

    expect(request.prompt.split("\n")).toHaveLength(2);
    expect(request.inputAssets).toEqual([
      expect.objectContaining({
        assetId: "asset-reference",
        kind: "image",
      }),
    ]);
  });

  test("combines all upstream text with the current prompt", () => {
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
      "Animal sports day, 3D style\nold reference image prompt\nold reference image text\nThe lion is behind the zebra, and the zebra is first place",
    );
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

  test("builds target-node upstream outputs from temporary reference upload configs", () => {
    const outputs = __workerTestUtils.getDependencyOutputs(
      {
        config: { routeKey: "image.default" },
        dependencies: ["reference"],
        dependents: [],
        id: "image",
        type: "image.generate",
      },
      [],
      {
        compiled_graph_json: {
          edges: [
            { source: "reference", target: "image" },
          ],
          entryNodeIds: ["reference"],
          nodes: [
            {
              config: {
                mimeType: "image/png",
                naturalHeight: 768,
                naturalWidth: 1024,
                referenceUploadId: "00000000-0000-4000-8000-000000000031",
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
      {
        assets: [
          expect.objectContaining({
            assetId: "00000000-0000-4000-8000-000000000031",
            kind: "image",
            metadata: expect.objectContaining({
              referenceUploadId: "00000000-0000-4000-8000-000000000031",
              source: "temporary-reference-upload",
            }),
            mimeType: "image/png",
          }),
        ],
      },
    ]);
  });

  test("forwards temporary reference uploads as provider input assets", () => {
    const request = __workerTestUtils.buildImageRequest(
      [
        {
          assets: [
            {
              assetId: "00000000-0000-4000-8000-000000000031",
              kind: "image",
              metadata: {
                base64: "data:image/png;base64,dGVtcC1pbWFnZQ==",
                referenceUploadId: "00000000-0000-4000-8000-000000000031",
                source: "temporary-reference-upload",
                url: "data:image/png;base64,dGVtcC1pbWFnZQ==",
              },
              mimeType: "image/png",
            },
          ],
        },
      ],
      {
        generationPrompt: "turn the reference into a poster",
        routeKey: "image.default",
      },
    );

    expect(request.inputAssets).toEqual([
      expect.objectContaining({
        assetId: "00000000-0000-4000-8000-000000000031",
        metadata: expect.objectContaining({
          base64: "data:image/png;base64,dGVtcC1pbWFnZQ==",
          source: "temporary-reference-upload",
        }),
      }),
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

  test("forwards panorama and wraparound params into provider metadata", () => {
    const request = __workerTestUtils.buildImageRequest(
      [],
      {
        generationPrompt: "未来城市中庭",
        modelId: "nano-banana-pro",
        params: {
          generationMode: "wraparound_270",
          wraparound: {
            coverageDegrees: 270,
            layout: "continuous",
            panels: 3,
            subjectType: "scene",
          },
        },
        routeKey: "image.default",
      },
    );

    expect(request.metadata).toMatchObject({
      params: expect.objectContaining({
        generationMode: "wraparound_270",
        wraparound: expect.objectContaining({
          coverageDegrees: 270,
          layout: "continuous",
          panels: 3,
          subjectType: "scene",
        }),
      }),
    });
  });

  test("applies Agent tool run settings and reference asset ids to provider image requests", () => {
    const request = __workerTestUtils.buildImageRequest(
      [],
      {
        agentTool: {
          aspectRatio: "16:9",
          format: "jpeg",
          modelDisplayName: "GPT-Image-2",
          moderation: "low",
          n: 3,
          prompt: "make three poster options",
          quality: "high",
          referenceAssetIds: ["asset-reference-1", "asset-reference-2"],
          routeKey: "image.gpt-image-2.line2",
          routeLabel: "线路二",
          size: "4K",
        },
        generationPrompt: "old node prompt",
        params: {
          size: "1K",
        },
        routeKey: "image.default",
      },
    );

    expect(request).toMatchObject({
      inputAssets: [
        expect.objectContaining({ assetId: "asset-reference-1", kind: "image" }),
        expect.objectContaining({ assetId: "asset-reference-2", kind: "image" }),
      ],
      metadata: expect.objectContaining({
        aspectRatio: "16:9",
        imageSize: "4K",
        n: 3,
        params: expect.objectContaining({
          aspectRatio: "16:9",
          format: "jpeg",
          moderation: "low",
          n: 3,
          output_format: "jpeg",
          quality: "high",
          size: "4K",
        }),
      }),
      prompt: "make three poster options",
      routeKey: "image.gpt-image-2.line2",
    });
  });

  test("forwards image node reference asset ids as provider input assets", () => {
    const request = __workerTestUtils.buildImageRequest(
      [
        {
          assets: [
            {
              assetId: "upstream-reference",
              kind: "image",
              mimeType: "image/png",
            },
          ],
        },
      ],
      {
        generationPrompt: "use all selected references",
        referenceAssetItemIds: ["asset-b", "asset-a"],
        referenceOrder: ["asset:asset-a", "upstream:node-1", "asset:asset-b", "asset:asset-missing"],
        routeKey: "image.default",
      },
    );

    expect(request.inputAssets).toEqual([
      expect.objectContaining({ assetId: "asset-a", kind: "image" }),
      expect.objectContaining({ assetId: "upstream-reference", kind: "image" }),
      expect.objectContaining({ assetId: "asset-b", kind: "image" }),
    ]);
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
