import { describe, expect, test } from "vitest";

import { mergeVideoCapabilities } from "./videoGenerationCapabilities";
import { resolveAutomaticVideoMode, normalizeReferenceRolesForMode, validateVideoReferenceInputs } from "./videoReferenceRules";
import type { VideoGenerationParamsV2, VideoReferenceInputV2 } from "./videoTypes";

const geminiCapabilities = mergeVideoCapabilities({
  confirmedByRoute: true,
  supportedModes: ["text_to_video", "image_to_video", "image_reference", "all_reference"],
  referenceSemantics: "style_images_and_source_video",
  modeConstraints: {
    text_to_video: { maxTotal: 0 },
    image_to_video: { maxImages: 1, maxTotal: 1, minImages: 1 },
    image_reference: { maxImages: 5, maxTotal: 5, minImages: 2 },
    all_reference: { maxImages: 5, maxVideos: 1, maxTotal: 6, minVideos: 1 },
  },
});
const veoCapabilities = mergeVideoCapabilities({
  confirmedByRoute: true,
  supportedModes: ["text_to_video", "image_to_video", "first_last_frame"],
  referenceSemantics: "ordered_first_last_frames",
  modeConstraints: {
    text_to_video: { maxTotal: 0 },
    image_to_video: { maxImages: 1, maxTotal: 1, minImages: 1 },
    first_last_frame: { maxImages: 2, maxTotal: 2, minImages: 2 },
  },
});

const reference = (kind: "image" | "video" | "audio", order: number, role = "reference_image"): VideoReferenceInputV2 => ({
  referenceKey: `${kind}:${order}`,
  source: { kind: "asset", id: `${kind}-${order}` },
  mediaKind: kind,
  role: role as VideoReferenceInputV2["role"],
  order,
});

const params = (overrides: Partial<VideoGenerationParamsV2> = {}): VideoGenerationParamsV2 => ({
  schemaVersion: 2,
  mode: "text_to_video",
  aspectRatio: "16:9",
  resolution: "720P",
  durationSeconds: 4,
  generateAudio: true,
  count: 1,
  referenceInputs: [],
  cameraMotionId: null,
  visualTone: null,
  ...overrides,
});

describe("video reference rules", () => {
  test.each([
    [[], "text_to_video"],
    [[reference("image", 0)], "image_to_video"],
    [[reference("image", 0), reference("image", 1)], "image_reference"],
    [[reference("image", 0), reference("image", 1), reference("image", 2)], "image_reference"],
  ] as const)("resolves %s for Gemini", (references, mode) => {
    expect(resolveAutomaticVideoMode(geminiCapabilities, references, "text_to_video").mode).toBe(mode);
  });

  test("converts two Veo images to ordered first and last frames", () => {
    const result = resolveAutomaticVideoMode(veoCapabilities, [reference("image", 0), reference("image", 1)], "image_reference");
    expect(result).toMatchObject({ mode: "first_last_frame", incompatible: false });
    expect(result.references).toEqual([
      expect.objectContaining({ role: "first_frame", order: 0 }),
      expect.objectContaining({ role: "last_frame", order: 1 }),
    ]);
  });

  test("keeps Veo video input and reports incompatibility", () => {
    expect(resolveAutomaticVideoMode(veoCapabilities, [reference("video", 0, "source_video")], "all_reference")).toMatchObject({ mode: "all_reference", incompatible: true });
  });

  test("uses all-reference for video, audio, and mixed media then degrades as references are removed", () => {
    const mixed = [reference("image", 0), reference("video", 1, "source_video"), reference("audio", 2, "reference_audio")];
    expect(resolveAutomaticVideoMode(geminiCapabilities, mixed, "image_reference")).toMatchObject({
      incompatible: false,
      mode: "all_reference",
      references: [
        expect.objectContaining({ role: "reference_image" }),
        expect.objectContaining({ role: "source_video" }),
        expect.objectContaining({ role: "reference_audio" }),
      ],
    });
    expect(resolveAutomaticVideoMode(geminiCapabilities, mixed.slice(0, 1), "all_reference")).toMatchObject({
      incompatible: false,
      mode: "image_to_video",
      references: [expect.objectContaining({ role: "main_image" })],
    });
    expect(resolveAutomaticVideoMode(geminiCapabilities, [], "image_to_video")).toMatchObject({
      incompatible: false,
      mode: "text_to_video",
      references: [],
    });
  });

  test("preserves reference keys and sources while normalizing roles", () => {
    const input = [reference("image", 9), reference("image", 3)];
    const result = normalizeReferenceRolesForMode(input, "first_last_frame", "ordered_first_last_frames");
    expect(result).toEqual([
      expect.objectContaining({ referenceKey: "image:3", source: input[1].source, role: "first_frame", order: 0 }),
      expect.objectContaining({ referenceKey: "image:9", source: input[0].source, role: "last_frame", order: 1 }),
    ]);
  });

  test("reports reference blockers without dropping inputs", () => {
    const input = [reference("image", 0), reference("image", 1), reference("image", 2), reference("image", 3), reference("image", 4), reference("image", 5)];
    const issues = validateVideoReferenceInputs(params({ mode: "image_reference", referenceInputs: input }), geminiCapabilities);
    expect(issues.map((issue) => issue.code)).toContain("REFERENCE_LIMIT_EXCEEDED");
    expect(input).toHaveLength(6);
  });

  test("requires the model-specific media counts and reference roles before generation", () => {
    const geminiAllReferenceWithoutVideo = validateVideoReferenceInputs(
      params({ mode: "all_reference", referenceInputs: [reference("image", 0, "reference_image")] }),
      geminiCapabilities,
    );
    expect(geminiAllReferenceWithoutVideo.map((issue) => issue.code)).toContain("VIDEO_MODE_INPUT_REQUIRED");

    const geminiSingleImageWithoutMainRole = validateVideoReferenceInputs(
      params({ mode: "image_to_video", referenceInputs: [reference("image", 0, "reference_image")] }),
      geminiCapabilities,
    );
    expect(geminiSingleImageWithoutMainRole.map((issue) => issue.code)).toContain("VIDEO_MODE_INPUT_REQUIRED");

    const veoSingleImageWithoutFirstFrameRole = validateVideoReferenceInputs(
      params({ mode: "image_to_video", referenceInputs: [reference("image", 0, "main_image")] }),
      veoCapabilities,
    );
    expect(veoSingleImageWithoutFirstFrameRole.map((issue) => issue.code)).toContain("VIDEO_MODE_INPUT_REQUIRED");

    const reversedVeoFrames = validateVideoReferenceInputs(
      params({
        mode: "first_last_frame",
        referenceInputs: [reference("image", 0, "last_frame"), reference("image", 1, "first_frame")],
      }),
      veoCapabilities,
    );
    expect(reversedVeoFrames.map((issue) => issue.code)).toContain("VIDEO_MODE_INPUT_REQUIRED");
  });
});
