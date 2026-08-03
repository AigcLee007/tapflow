import { describe, expect, test } from "vitest";

import {
  readVideoCapabilities,
  readVideoReferenceMetadata,
  validateVideoGenerationRequest,
  type VideoGenerationCapabilities,
} from "../src/video-generation-contract.js";
import type { AssetReferenceInput, VideoGenerationRequest } from "../src/types.js";

const geminiCapabilities: VideoGenerationCapabilities = {
  aspectRatios: ["16:9", "9:16"],
  audioControlMode: "toggle",
  confirmedByRoute: true,
  defaults: {
    aspectRatio: "16:9",
    count: 1,
    durationSeconds: 8,
    generateAudio: true,
    mode: "text_to_video",
    resolution: "720P",
  },
  durationStepSeconds: 2,
  maxAudios: 0,
  maxCount: 1,
  maxDurationSeconds: 10,
  maxImages: 5,
  maxPromptLength: 1_000,
  maxTotal: 5,
  maxVideos: 1,
  minDurationSeconds: 4,
  modeConstraints: {
    all_reference: { maxImages: 5, maxTotal: 5, maxVideos: 1, minImages: 1 },
    image_reference: { maxImages: 1, maxTotal: 1, minImages: 1 },
    image_to_video: { maxImages: 1, maxTotal: 1, minImages: 1 },
    text_to_video: { maxTotal: 0 },
  },
  referenceSemantics: "mixed_reference_media",
  resolutions: ["720P", "1080P"],
  supportedDurations: [4, 6, 8, 10],
  supportedModes: ["text_to_video", "image_to_video", "image_reference", "all_reference"],
};

function request(overrides: Partial<VideoGenerationRequest> = {}): VideoGenerationRequest {
  return {
    inputAssets: null,
    metadata: null,
    model: null,
    params: {
      aspectRatio: "16:9",
      count: 1,
      durationSeconds: 8,
      generateAudio: true,
      mode: "text_to_video",
      resolution: "720P",
    },
    prompt: "A sunlit alley after rain",
    routeKey: null,
    ...overrides,
  };
}

function asset(
  mediaKind: "audio" | "image" | "video",
  role: "first_frame" | "last_frame" | "main_image" | "reference_image" | "reference_video" | "source_video" | "reference_audio" = "reference_image",
  order = 0,
): AssetReferenceInput {
  return {
    assetId: `${mediaKind}-${order}`,
    kind: mediaKind,
    metadata: {
      videoReference: {
        mediaKind,
        order,
        referenceKey: `${mediaKind}-${order}`,
        role,
        sourceKind: "asset",
        sourceNodeId: null,
      },
    },
  };
}

describe("video generation contract", () => {
  test("reads only confirmed, complete route capabilities", () => {
    expect(readVideoCapabilities(geminiCapabilities)).toEqual(geminiCapabilities);
    expect(readVideoCapabilities({ confirmedByRoute: false })).toBeNull();
    expect(readVideoCapabilities({ confirmedByRoute: true, supportedModes: [] })).toBeNull();
  });

  test("reads valid asset reference metadata and rejects incomplete metadata", () => {
    expect(readVideoReferenceMetadata(asset("image"))).toMatchObject({
      mediaKind: "image",
      role: "reference_image",
    });
    expect(readVideoReferenceMetadata({ assetId: "bad", metadata: { videoReference: { mediaKind: "image" } } })).toBeNull();
  });

  test("accepts valid Gemini text, image, multi-reference, and mixed-reference requests", () => {
    const cases: VideoGenerationRequest[] = [
      request(),
      request({
        inputAssets: [asset("image", "main_image")],
        params: { ...request().params!, mode: "image_to_video" },
      }),
      request({
        inputAssets: [asset("image", "main_image"), asset("image", "reference_image", 1)],
        params: { ...request().params!, mode: "all_reference" },
      }),
      request({
        inputAssets: [asset("image", "main_image"), asset("video", "reference_video", 1)],
        params: { ...request().params!, mode: "all_reference" },
      }),
    ];

    for (const value of cases) {
      expect(validateVideoGenerationRequest(value, geminiCapabilities)).toEqual([]);
    }
  });

  test.each([
    [request({ prompt: "   " }), "VIDEO_PROMPT_REQUIRED"],
    [request({ prompt: "x".repeat(1_001) }), "VIDEO_PROMPT_TOO_LONG"],
    [request({ params: { ...request().params!, mode: "first_last_frame" } }), "UNSUPPORTED_VIDEO_MODE"],
    [request({ params: { ...request().params!, mode: "image_to_video" } }), "VIDEO_MODE_INPUT_REQUIRED"],
    [request({ params: { ...request().params!, aspectRatio: "1:1" } }), "UNSUPPORTED_ASPECT_RATIO"],
    [request({ params: { ...request().params!, resolution: "4K" } }), "UNSUPPORTED_RESOLUTION"],
    [request({ params: { ...request().params!, durationSeconds: 5 } }), "UNSUPPORTED_DURATION"],
    [request({ params: { ...request().params!, count: 2 as 1 } }), "VIDEO_COUNT_UNSUPPORTED"],
    [request({ inputAssets: [{ assetId: "bad" }] }), "UNSUPPORTED_REFERENCE_KIND"],
  ] as const)("reports %s", (value, code) => {
    expect(validateVideoGenerationRequest(value, geminiCapabilities).map((issue) => issue.code)).toContain(code);
  });

  test("rejects fixed audio changes and over-limit reference media", () => {
    const fixedAudio = { ...geminiCapabilities, audioControlMode: "always_on_implicit" as const };
    expect(validateVideoGenerationRequest(request({ params: { ...request().params!, generateAudio: false } }), fixedAudio)[0]?.code).toBe("AUDIO_SETTING_FIXED");

    const tooManyImages = request({
      inputAssets: Array.from({ length: 6 }, (_, index) => asset("image", "reference_image", index)),
      params: { ...request().params!, mode: "all_reference" },
    });
    expect(validateVideoGenerationRequest(tooManyImages, geminiCapabilities).map((issue) => issue.code)).toContain("REFERENCE_LIMIT_EXCEEDED");
  });

  test("requires visual references with Sora audio and enforces total references", () => {
    const sora: VideoGenerationCapabilities = {
      ...geminiCapabilities,
      maxAudios: 2,
      maxTotal: 2,
      modeConstraints: {
        all_reference: { maxAudios: 2, maxImages: 1, maxTotal: 2, requiresVisualWithAudio: true },
        text_to_video: { maxTotal: 0 },
      },
      supportedModes: ["text_to_video", "all_reference"],
    };
    const audioOnly = request({
      inputAssets: [asset("audio", "reference_audio")],
      params: { ...request().params!, mode: "all_reference" },
    });
    expect(validateVideoGenerationRequest(audioOnly, sora).map((issue) => issue.code)).toContain("AUDIO_REFERENCE_REQUIRES_VISUAL");

    const tooMany = request({
      inputAssets: [asset("image", "reference_image"), asset("audio", "reference_audio", 1), asset("audio", "reference_audio", 2)],
      params: { ...request().params!, mode: "all_reference" },
    });
    expect(validateVideoGenerationRequest(tooMany, sora).map((issue) => issue.code)).toContain("REFERENCE_MEDIA_TOTAL_EXCEEDED");
  });

  test("requires Veo first and last frames in order", () => {
    const veo: VideoGenerationCapabilities = {
      ...geminiCapabilities,
      modeConstraints: {
        first_last_frame: { maxImages: 2, maxTotal: 2, minImages: 2 },
        text_to_video: { maxTotal: 0 },
      },
      referenceSemantics: "ordered_first_last_frames",
      supportedModes: ["text_to_video", "first_last_frame"],
    };
    const valid = request({
      inputAssets: [asset("image", "first_frame", 0), asset("image", "last_frame", 1)],
      params: { ...request().params!, mode: "first_last_frame" },
    });
    expect(validateVideoGenerationRequest(valid, veo)).toEqual([]);

    const reversed = request({
      inputAssets: [asset("image", "last_frame", 0), asset("image", "first_frame", 1)],
      params: { ...request().params!, mode: "first_last_frame" },
    });
    expect(validateVideoGenerationRequest(reversed, veo).map((issue) => issue.code)).toContain("VIDEO_MODE_INPUT_REQUIRED");
  });
});
