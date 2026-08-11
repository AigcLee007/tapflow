import { describe, expect, test } from "vitest";

import { createDefaultVideoGenerationParams } from "./videoGenerationParams";
import {
  correctVideoGenerationParams,
  getVideoGenerationBlocker,
  mergeVideoCapabilities,
} from "./videoGenerationCapabilities";
import type { VideoModelOption } from "./videoTypes";

const routeOption = (overrides: Partial<VideoModelOption> = {}): VideoModelOption => ({
  capabilities: mergeVideoCapabilities({ confirmedByRoute: true }),
  blocker: null,
  description: "A creator-safe description",
  estimatedCredits: 12,
  estimatedDurationLabel: "About 1 minute",
  id: "catalog-video-1",
  label: "Video One",
  minChargeCredits: 12,
  ...overrides,
});

describe("video generation capabilities", () => {
  test("uses editable safe defaults until a route confirms its capabilities", () => {
    const capabilities = mergeVideoCapabilities();

    expect(capabilities).toMatchObject({
      aspectRatios: ["auto", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
      confirmedByRoute: false,
      durationStepSeconds: 1,
      maxDurationSeconds: 15,
      maxCount: 4,
      minDurationSeconds: 4,
      resolutions: ["480P", "720P", "1080P", "2K", "4K"],
      supportedModes: ["text_to_video", "all_reference", "image_to_video", "first_last_frame", "image_reference"],
      supportsAudio: true,
    });
  });

  test("preserves unsupported all-reference mode while correcting other route parameters", () => {
    const route = {
      aspectRatios: ["16:9"] as const,
      durationStepSeconds: 2,
      maxCount: 2,
      maxDurationSeconds: 6,
      minDurationSeconds: 2,
      resolutions: ["1080P"] as const,
      supportedModes: ["image_to_video"] as const,
      supportsAudio: false,
    };
    const capabilities = mergeVideoCapabilities(route, { confirmedByRoute: true });
    const params = {
      ...createDefaultVideoGenerationParams(),
      aspectRatio: "9:16" as const,
      count: 4 as const,
      durationSeconds: 5,
      generateAudio: true,
      mode: "all_reference" as const,
      resolution: "4K" as const,
    };

    const corrected = correctVideoGenerationParams(params, capabilities);

    expect(route).toEqual({
      aspectRatios: ["16:9"],
      durationStepSeconds: 2,
      maxCount: 2,
      maxDurationSeconds: 6,
      minDurationSeconds: 2,
      resolutions: ["1080P"],
      supportedModes: ["image_to_video"],
      supportsAudio: false,
    });
    expect(corrected.params).toMatchObject({
      aspectRatio: "16:9",
      count: 1,
      durationSeconds: 6,
      generateAudio: false,
      mode: "all_reference",
      resolution: "1080P",
    });
    expect(corrected.diagnostics.map((item) => item.field)).toEqual([
      "aspectRatio",
      "resolution",
      "durationSeconds",
      "generateAudio",
      "count",
    ]);
  });

  test("preserves discrete route durations and corrects to the nearest supported duration", () => {
    const capabilities = mergeVideoCapabilities({
      confirmedByRoute: true,
      minDurationSeconds: 4,
      maxDurationSeconds: 10,
      durationStepSeconds: 2,
      supportedDurations: [4, 6, 8, 10],
    });

    expect(capabilities.supportedDurations).toEqual([4, 6, 8, 10]);
    expect(correctVideoGenerationParams({ ...createDefaultVideoGenerationParams(), durationSeconds: 9 }, capabilities).params.durationSeconds).toBe(8);
  });

  test("returns the first generation blocker in the documented order", () => {
    const params = createDefaultVideoGenerationParams();
    const unconfirmed = routeOption({ capabilities: mergeVideoCapabilities() });
    const blocked = routeOption({ blocker: "PRICING_NOT_FOUND" });
    const unsupported = routeOption({
      capabilities: mergeVideoCapabilities({
        aspectRatios: ["16:9"],
        confirmedByRoute: true,
        maxCount: 1,
        resolutions: ["480P"],
        supportedModes: ["image_to_video"],
        supportsAudio: false,
        supportsHumanReview: true,
      }),
    });

    expect(getVideoGenerationBlocker(null, params)).toBe("NO_VIDEO_GENERATION_ROUTE");
    expect(getVideoGenerationBlocker(unconfirmed, params)).toBe("NO_VIDEO_GENERATION_ROUTE");
    expect(getVideoGenerationBlocker(blocked, params)).toBe("PRICING_NOT_FOUND");
    expect(getVideoGenerationBlocker(unsupported, params)).toBe("UNSUPPORTED_MODE");
    expect(getVideoGenerationBlocker(unsupported, { ...params, mode: "image_to_video" })).toBe("UNSUPPORTED_RESOLUTION");
    expect(getVideoGenerationBlocker(unsupported, { ...params, aspectRatio: "16:9", mode: "image_to_video" })).toBe("UNSUPPORTED_RESOLUTION");
    expect(getVideoGenerationBlocker(unsupported, { ...params, aspectRatio: "16:9", mode: "image_to_video", resolution: "480P", generateAudio: true })).toBe("AUDIO_SETTING_FIXED");
    expect(getVideoGenerationBlocker(unsupported, { ...params, aspectRatio: "16:9", count: 2, generateAudio: false, mode: "image_to_video", resolution: "480P" })).toBe("UNSUPPORTED_COUNT");
    expect(getVideoGenerationBlocker(unsupported, { ...params, aspectRatio: "16:9", count: 1, generateAudio: false, mode: "image_to_video", resolution: "480P" })).toBe("VIDEO_MODE_INPUT_REQUIRED");
  });

  test("fails closed for an editor-only option and an option without active pricing", () => {
    const params = createDefaultVideoGenerationParams();
    const editorOnly = routeOption({
      capabilities: mergeVideoCapabilities({ confirmedByRoute: false }),
    });
    const noPrice = routeOption({ blocker: "PRICING_NOT_FOUND", estimatedCredits: null, minChargeCredits: null });

    expect(getVideoGenerationBlocker(editorOnly, params)).toBe("NO_VIDEO_GENERATION_ROUTE");
    expect(getVideoGenerationBlocker(noPrice, params)).toBe("PRICING_NOT_FOUND");
  });

  test("blocks a missing or overlong prompt after catalog and route checks", () => {
    const option = routeOption({
      capabilities: mergeVideoCapabilities({
        confirmedByRoute: true,
        maxPromptLength: 12,
      }),
    });
    const params = createDefaultVideoGenerationParams();

    expect(getVideoGenerationBlocker(option, params, "  ")).toBe("VIDEO_PROMPT_REQUIRED");
    expect(getVideoGenerationBlocker(option, params, "  ", true)).toBeNull();
    expect(getVideoGenerationBlocker(option, params, "1234567890123")).toBe("VIDEO_PROMPT_TOO_LONG");
    expect(getVideoGenerationBlocker(option, params, "1234567890123", true)).toBe("VIDEO_PROMPT_TOO_LONG");
    expect(getVideoGenerationBlocker(option, params, "Short prompt")).toBeNull();
  });
});
