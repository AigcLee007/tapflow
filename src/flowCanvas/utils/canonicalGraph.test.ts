import { describe, expect, it } from "vitest";

import { canonicalizeGraph } from "./canonicalGraph";

describe("canonicalizeGraph", () => {
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
          schemaVersion: 1,
          resolution: "4K",
          durationSeconds: 8,
          generateAudio: true,
          count: 4,
          cameraMotionId: "dolly-in",
          visualTone: "cinematic_teal",
          contextPaletteRefs: [
            { source: { kind: "asset", id: "asset-first" }, colorToken: "#0ea5e9" },
          ],
        },
      },
    });
    expect(JSON.stringify(graph)).not.toMatch(
      /blob:|data:|X-Amz-Signature|posterUrl|previewUrl|transientSignedPreview/,
    );
  });
});
