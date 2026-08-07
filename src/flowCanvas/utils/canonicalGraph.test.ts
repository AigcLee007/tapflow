import { describe, expect, it } from "vitest";

import { canonicalizeGraph } from "./canonicalGraph";

describe("canonicalizeGraph", () => {
  it("persists stable unified input fields without runtime previews or excerpts", () => {
    const graph = canonicalizeGraph({
      edges: [],
      nodes: [{
        id: "image-1",
        position: { x: 0, y: 0 },
        type: "image",
        data: {
          inputOrder: ["upstream:script", "asset:reference-image"],
          lastGenerationInputSignature: "input-v1:12345678",
          previewUrl: "https://cdn.test/preview.webp?X-Amz-Signature=temporary",
          textExcerpt: "Runtime-only text snippet",
          imagePreview: "blob:http://localhost/preview",
          encodedPreview: "data:image/webp;base64,preview",
          signedPreview: "https://cdn.test/image.webp?signature=temporary",
        },
      }],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    const persisted = JSON.stringify(graph);

    expect(graph.nodes[0]?.data).toMatchObject({
      inputOrder: ["upstream:script", "asset:reference-image"],
      lastGenerationInputSignature: "input-v1:12345678",
    });
    expect(persisted).not.toMatch(
      /previewUrl|textExcerpt|blob:|data:|X-Amz-Signature|signature=temporary|Runtime-only text snippet/,
    );
  });

  it("preserves durable video generation selections while removing transient media URLs", () => {
    const graph = canonicalizeGraph({
      edges: [],
      nodes: [
        {
          id: "video-1",
          position: { x: 0, y: 0 },
          type: "video",
          data: {
            modelId: "veo3.1-fast-4K",
            routeKey: "video.default",
            referenceAssetItemIds: ["asset-first", "asset-last"],
            referenceOrder: ["first", "last"],
            params: {
              videoGeneration: {
                schemaVersion: 1,
                mode: "first_last_frame",
                aspectRatio: "16:9",
                resolution: "4K",
                durationSeconds: 8,
                generateAudio: true,
                count: 4,
                cameraMotionId: "dolly-in",
                visualTone: "cinematic_teal",
                contextPaletteRefs: [
                  {
                    role: "subject",
                    source: { kind: "asset", id: "asset-first" },
                    colorToken: "#0ea5e9",
                    posterUrl: "blob:http://localhost/poster",
                  },
                ],
                humanReview: { status: "verified", verificationRef: "review-1" },
                localBlob: new Blob(["preview"], { type: "image/webp" }),
                localFile: new File(["preview"], "preview.webp", { type: "image/webp" }),
                referenceRolesByKey: {
                  first: {
                    role: "first_frame",
                    source: { kind: "asset", id: "asset-first" },
                    previewUrl: "data:image/webp;base64,poster",
                    transientSignedPreview:
                      "https://cdn.test/preview.webp?X-Amz-Signature=temporary",
                  },
                },
              },
            },
          },
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(graph.nodes[0]?.data).toMatchObject({
      modelId: "veo3.1-fast-4K",
      routeKey: "video.default",
      referenceAssetItemIds: ["asset-first", "asset-last"],
      referenceOrder: ["first", "last"],
      params: {
        videoGeneration: {
          schemaVersion: 2,
          resolution: "4K",
          durationSeconds: 8,
          generateAudio: true,
          count: 1,
          cameraMotionId: "dolly-in",
          visualTone: "cinematic_teal",
          referenceInputs: [
            { referenceKey: "asset:asset-first:0", source: { kind: "asset", id: "asset-first" }, mediaKind: "image", role: "first_frame", order: 0 },
          ],
        },
      },
    });
    expect(JSON.stringify(graph)).not.toMatch(
      /blob:|data:|X-Amz-Signature|posterUrl|previewUrl|transientSignedPreview/,
    );
    expect(graph.nodes[0]?.data).not.toHaveProperty("params.videoGeneration.localBlob");
    expect(graph.nodes[0]?.data).not.toHaveProperty("params.videoGeneration.localFile");
  });

  it("migrates legacy video params at the graph persistence boundary without changing other node kinds", () => {
    const graph = canonicalizeGraph({
      edges: [],
      nodes: [
        {
          id: "video-legacy",
          position: { x: 0, y: 0 },
          type: "video",
          data: {
            modelId: "veo3.1-4k",
            routeKey: "video.custom-route",
            referenceAssetItemIds: ["asset-first", "asset-last"],
            referenceOrder: ["first", "last"],
            batchCount: 3,
            params: {
              aspect_ratio: "21:9",
              duration: "6",
              quality: "4k cinematic",
              hd: true,
              n: 3,
              referenceLabels: ["First Frame", "Last Frame"],
              previewUrl: "blob:http://localhost/video-preview",
            },
          },
        },
        {
          id: "image-legacy",
          position: { x: 100, y: 0 },
          type: "image",
          data: {
            batchCount: 3,
            params: { aspect_ratio: "21:9", quality: "4k cinematic" },
          },
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(graph.nodes[0]?.data).toMatchObject({
      modelId: "veo3.1-fast-4K",
      routeKey: "video.custom-route",
      referenceAssetItemIds: ["asset-first", "asset-last"],
      referenceOrder: ["first", "last"],
      params: {
        videoGeneration: {
          schemaVersion: 2,
          mode: "first_last_frame",
          aspectRatio: "21:9",
          resolution: "4K",
          durationSeconds: 6,
          count: 1,
          referenceInputs: [
            { referenceKey: "asset:asset-first:0", source: { kind: "asset", id: "asset-first" }, mediaKind: "image", role: "first_frame", order: 0 },
            { referenceKey: "asset:asset-last:1", source: { kind: "asset", id: "asset-last" }, mediaKind: "image", role: "last_frame", order: 1 },
          ],
        },
      },
    });
    expect(graph.nodes[0]?.data).not.toHaveProperty("params.aspect_ratio");
    expect(graph.nodes[0]?.data).not.toHaveProperty("params.duration");
    expect(graph.nodes[0]?.data).not.toHaveProperty("params.quality");
    expect(graph.nodes[0]?.data).not.toHaveProperty("params.n");
    expect(graph.nodes[0]?.data).not.toHaveProperty("params.referenceLabels");
    expect(graph.nodes[0]?.data).not.toHaveProperty("batchCount");
    expect(graph.nodes[1]?.data).toEqual({
      batchCount: 3,
      params: { aspect_ratio: "21:9", quality: "4k cinematic" },
    });
  });

  it("keeps generated result asset ids while removing their signed URLs", () => {
    const graph = canonicalizeGraph({
      edges: [],
      nodes: [{
        id: "image-1",
        position: { x: 0, y: 0 },
        type: "image",
        data: {
          assetId: "asset-first",
          generatedResults: [{
            assetId: "asset-first",
            createdAt: 1,
            id: "asset:asset-first",
            url: "https://cdn.test/first.png?X-Amz-Signature=temporary",
          }],
        },
      }],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(graph.nodes[0]?.data.generatedResults).toEqual([{
      assetId: "asset-first",
      createdAt: 1,
      id: "asset:asset-first",
    }]);
  });
});
