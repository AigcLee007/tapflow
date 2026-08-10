import { describe, expect, test } from "vitest";

import {
  evaluateVideoModeAvailability,
  resolveAvailableVideoMode,
} from "./videoModeAvailability";
import { createSafeDefaultVideoCapabilities } from "./videoGenerationCapabilities";
import type { VideoGenerationCapabilities, VideoGenerationMode } from "./videoTypes";

const modes: VideoGenerationMode[] = ["text_to_video", "image_to_video", "first_last_frame", "image_reference", "all_reference"];

const capabilities = (overrides: Partial<VideoGenerationCapabilities> = {}): VideoGenerationCapabilities => ({
  ...createSafeDefaultVideoCapabilities(),
  confirmedByRoute: true,
  maxAudios: 10,
  maxImages: 10,
  maxTotal: 10,
  maxVideos: 10,
  supportedModes: modes,
  ...overrides,
});

const input = (inputKey: string, kind: "text" | "image" | "video" | "audio") => ({ inputKey, kind });

const allowedModes = (inputs: Array<ReturnType<typeof input>>) => (
  evaluateVideoModeAvailability(inputs, capabilities()).items
    .filter((item) => item.inputAllowed)
    .map((item) => item.mode)
);

describe("video mode input availability", () => {
  test.each([
    ["no media", [], ["text_to_video"], "text_to_video"],
    ["text only", [input("prompt", "text")], ["text_to_video"], "text_to_video"],
    ["one image", [input("image-1", "image")], ["all_reference", "image_to_video", "first_last_frame", "image_reference"], "image_to_video"],
    ["two images", [input("image-1", "image"), input("image-2", "image")], ["all_reference", "first_last_frame", "image_reference"], "image_reference"],
    ["three images", [input("image-1", "image"), input("image-2", "image"), input("image-3", "image")], ["all_reference", "image_reference"], "image_reference"],
    ["video", [input("video-1", "video")], ["all_reference"], "all_reference"],
    ["audio", [input("audio-1", "audio")], ["all_reference"], "all_reference"],
  ])("uses the complete topology for %s", (_name, inputs, expected, recommendedMode) => {
    const availability = evaluateVideoModeAvailability(inputs, capabilities());

    expect(availability.items.filter((item) => item.inputAllowed).map((item) => item.mode)).toEqual(expected);
    expect(availability.recommendedMode).toBe(recommendedMode);
  });

  test("deduplicates stable keys and keeps text out of media topology counts", () => {
    const availability = evaluateVideoModeAvailability([
      input("prompt-1", "text"),
      input("prompt-1", "image"),
      input("image-1", "image"),
      input("image-1", "image"),
      input("prompt-2", "text"),
    ], capabilities());

    expect(availability.counts).toEqual({ audio: 0, image: 1, text: 2, total: 1, video: 0 });
    expect(availability.items.find((item) => item.mode === "text_to_video")).toMatchObject({
      inputAllowed: false,
      reason: "INPUT_MEDIA_NOT_ALLOWED",
    });
  });

  test("preserves a still-enabled manual mode choice", () => {
    const resolved = resolveAvailableVideoMode("all_reference", [input("image-1", "image")], capabilities());

    expect(resolved).toMatchObject({ incompatible: false, mode: "all_reference", switched: false });
  });

  test("falls back from an invalid two-image selection to a supported recommended option", () => {
    const resolved = resolveAvailableVideoMode("image_to_video", [input("image-1", "image"), input("image-2", "image")], capabilities({
      supportedModes: ["first_last_frame", "all_reference"],
    }));

    expect(resolved).toMatchObject({ incompatible: false, mode: "first_last_frame", switched: true });
  });

  test("intersects input topology with model support and route constraints", () => {
    const availability = evaluateVideoModeAvailability([input("audio-1", "audio")], capabilities({
      modeConstraints: {
        all_reference: { maxAudios: 0, requiresVisualWithAudio: true },
      },
      supportedModes: ["image_reference", "all_reference"],
    }));
    const allReference = availability.items.find((item) => item.mode === "all_reference");
    const imageReference = availability.items.find((item) => item.mode === "image_reference");

    expect(allReference).toMatchObject({
      enabled: false,
      inputAllowed: true,
      modelSupported: false,
      reason: "MODEL_CONSTRAINT_UNMET",
    });
    expect(imageReference).toMatchObject({
      enabled: false,
      inputAllowed: false,
      modelSupported: true,
      reason: "INPUT_VIDEO_OR_AUDIO_REQUIRES_ALL_REFERENCE",
    });

    const unsupported = evaluateVideoModeAvailability([], capabilities({ supportedModes: ["image_to_video"] }));
    expect(unsupported.items.find((item) => item.mode === "text_to_video")).toMatchObject({
      enabled: false,
      inputAllowed: true,
      modelSupported: false,
      reason: "MODEL_UNSUPPORTED",
    });

    expect(resolveAvailableVideoMode("all_reference", [input("audio-1", "audio")], capabilities({
      modeConstraints: { all_reference: { requiresVisualWithAudio: true } },
      supportedModes: ["all_reference"],
    }))).toMatchObject({ incompatible: true, mode: "all_reference", switched: false });
  });
});
