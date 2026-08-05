import { describe, expect, test } from "vitest";

import { createDefaultVideoGenerationParams } from "./videoGenerationParams";
import { mergeVideoCapabilities } from "./videoGenerationCapabilities";
import { createVideoModelSelectionPatch } from "./videoModelSelection";
import type { VideoModelOption } from "./videoTypes";

const createModel = (overrides: Partial<VideoModelOption> = {}): VideoModelOption => ({
  blocker: null,
  capabilities: mergeVideoCapabilities({ confirmedByRoute: true }),
  estimatedCredits: 1,
  id: "video-model",
  label: "Video model",
  minChargeCredits: 1,
  modelKey: "video-model",
  pricing: { billingBasis: "duration_second", exact: true, minChargeCredits: 1, unit: "video_generation", unitCredits: 1 },
  routeKey: "video.route",
  ...overrides,
});

describe("createVideoModelSelectionPatch", () => {
  test("returns a canonical node patch with corrected params and automatic mode", () => {
    const model = createModel({
      capabilities: mergeVideoCapabilities({
        confirmedByRoute: true,
        maxDurationSeconds: 4,
        minDurationSeconds: 4,
        supportedDurations: [4],
        supportedModes: ["image_to_video"],
      }),
      id: "canonical-model-id",
      routeKey: "video.canonical-route",
    });
    const params = {
      ...createDefaultVideoGenerationParams(),
      durationSeconds: 8,
      mode: "text_to_video" as const,
      referenceInputs: [{ mediaKind: "image" as const, order: 0, referenceKey: "reference-1", role: "reference_image" as const, source: { id: "asset-1", kind: "asset" as const } }],
    };

    expect(createVideoModelSelectionPatch([model], "canonical-model-id", { unrelated: "preserved", videoGeneration: params }, params)).toMatchObject({
      modelId: "canonical-model-id",
      routeKey: "video.canonical-route",
      params: {
        unrelated: "preserved",
        videoGeneration: {
          durationSeconds: 4,
          mode: "image_to_video",
          referenceInputs: [{ role: "main_image" }],
        },
      },
    });
  });

  test("returns null when the requested model is unavailable", () => {
    const params = createDefaultVideoGenerationParams();
    expect(createVideoModelSelectionPatch([], "missing", { videoGeneration: params }, params)).toBeNull();
  });
});
