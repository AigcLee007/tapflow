import { describe, expect, it } from "vitest";

import {
  createDefaultVideoGenerationParams,
  normalizeVideoGenerationParams,
  sanitizeVideoGenerationParams,
} from "./videoGenerationParams";

describe("video generation params", () => {
  it("creates the stable LibTV defaults", () => {
    expect(createDefaultVideoGenerationParams()).toEqual({
      schemaVersion: 1,
      mode: "text_to_video",
      aspectRatio: "auto",
      resolution: "720P",
      durationSeconds: 4,
      generateAudio: false,
      count: 1,
      cameraMotionId: null,
      visualTone: null,
      contextPaletteRefs: [],
      humanReview: { status: "not_required" },
      referenceRolesByKey: {},
    });
  });

  it.each([null, "invalid", 42, []])(
    "returns default params with correction diagnostics for a non-object input: %j",
    (input) => {
      const result = normalizeVideoGenerationParams(input);

      expect(result.params).toMatchObject(createDefaultVideoGenerationParams());
      expect(result.requiresUserCorrection).toBe(true);
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ field: "input" }));
    },
  );

  it("normalizes legacy params without changing durable node selections", () => {
    const input = {
      modelId: "veo3.1-4k",
      routeKey: "video.custom-route",
      referenceAssetItemIds: ["asset-first", "asset-last"],
      referenceOrder: ["first", "last"],
      params: {
        aspect_ratio: "21:9",
        duration: "6",
        hd: true,
        quality: "4k cinematic",
        n: 3,
        referenceLabels: ["First Frame", "Last Frame"],
      },
    };

    const result = normalizeVideoGenerationParams(input);

    expect(result.params).toMatchObject({
      schemaVersion: 1,
      mode: "first_last_frame",
      aspectRatio: "21:9",
      resolution: "4K",
      durationSeconds: 6,
      count: 4,
      referenceRolesByKey: {
        first: expect.objectContaining({ role: "first_frame" }),
        last: expect.objectContaining({ role: "last_frame" }),
      },
    });
    expect(result.modelId).toBe("veo3.1-fast-4K");
    expect(result.routeKey).toBe("video.custom-route");
    expect(result.referenceAssetItemIds).toEqual(["asset-first", "asset-last"]);
    expect(result.referenceOrder).toEqual(["first", "last"]);
    expect(result.requiresUserCorrection).toBe(true);
  });

  it("maps image reference labels while preserving unknown roles as reference", () => {
    const result = normalizeVideoGenerationParams({
      params: {
        referenceLabels: ["subject", "custom role"],
        referenceAssetItemIds: ["asset-subject", "asset-custom"],
      },
    });

    expect(result.params.mode).toBe("image_reference");
    expect(result.params.referenceRolesByKey).toEqual({
      reference_1: {
        role: "subject",
        source: { kind: "asset", id: "asset-subject" },
      },
      reference_2: {
        role: "reference",
        source: { kind: "asset", id: "asset-custom" },
      },
    });
  });

  it("reports invalid values instead of silently generating with them", () => {
    const result = normalizeVideoGenerationParams({
      params: {
        mode: "unsupported-mode",
        aspectRatio: "2:1",
        resolution: "12K",
        durationSeconds: "not-a-number",
        count: 9,
        humanReview: { status: "unknown" },
      },
    });

    expect(result.requiresUserCorrection).toBe(true);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "mode" }),
      expect.objectContaining({ field: "aspectRatio" }),
      expect.objectContaining({ field: "resolution" }),
      expect.objectContaining({ field: "durationSeconds" }),
      expect.objectContaining({ field: "humanReview.status" }),
    ]));
    expect(result.params.count).toBe(4);
  });

  it("chooses the mathematically nearest legal video count and breaks ties upward", () => {
    expect(normalizeVideoGenerationParams({ params: { count: 2.6 } }).params.count).toBe(2);
    expect(normalizeVideoGenerationParams({ params: { count: 1.5 } }).params.count).toBe(2);
    expect(normalizeVideoGenerationParams({ params: { count: 3 } }).params.count).toBe(4);
  });

  it("reports invalid stored reference roles instead of silently replacing them", () => {
    const result = normalizeVideoGenerationParams({
      params: {
        videoGeneration: {
          referenceRolesByKey: {
            subject: {
              role: "unsupported_role",
              source: { kind: "asset", id: "asset-subject" },
            },
          },
        },
      },
    });

    expect(result.requiresUserCorrection).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ field: "referenceRolesByKey.subject" }),
    );
    expect(result.params.referenceRolesByKey.subject).toBeNull();
  });

  it("is idempotent and does not mutate the input", () => {
    const input = {
      schemaVersion: 1,
      mode: "image_to_video",
      aspectRatio: "16:9",
      resolution: "1080P",
      durationSeconds: 8,
      generateAudio: true,
      count: 2,
      cameraMotionId: "dolly-in",
      visualTone: "cinematic_teal",
      contextPaletteRefs: [],
      humanReview: { status: "not_required" },
      referenceRolesByKey: {},
    };
    const before = structuredClone(input);

    const first = normalizeVideoGenerationParams(input);
    const second = normalizeVideoGenerationParams(first.params);

    expect(input).toEqual(before);
    expect(second.params).toEqual(first.params);
    expect(second.diagnostics).toEqual(first.diagnostics);
  });

  it("keeps invalid legacy diagnostics observable after a second normalization", () => {
    const first = normalizeVideoGenerationParams({
      params: {
        aspect_ratio: "2:1",
        duration: "not-a-number",
        n: 3,
      },
    });
    const second = normalizeVideoGenerationParams(first.params);

    expect(second.params).toEqual(first.params);
    expect(second.diagnostics).toEqual(first.diagnostics);
    expect(second.requiresUserCorrection).toBe(first.requiresUserCorrection);
  });

  it("removes local and signed URLs recursively while retaining stable IDs", () => {
    const sanitized = sanitizeVideoGenerationParams({
      schemaVersion: 1,
      mode: "text_to_video",
      aspectRatio: "auto",
      resolution: "720P",
      durationSeconds: 4,
      generateAudio: false,
      count: 1,
      cameraMotionId: "dolly-in",
      visualTone: "neutral",
      contextPaletteRefs: [
        {
          role: "subject",
          source: { kind: "asset", id: "asset-1" },
          colorToken: "#0ea5e9",
          previewUrl: "blob:http://localhost/preview",
        },
      ],
      humanReview: {
        status: "verified",
        verificationRef: "review-1",
        evidence: "https://cdn.test/evidence.png?X-Amz-Signature=secret",
      },
      referenceRolesByKey: {
        subject: {
          role: "subject",
          source: { kind: "asset", id: "asset-1" },
          previewUrl: "data:image/png;base64,abc",
        },
      },
    });

    expect(sanitized).toMatchObject({
      cameraMotionId: "dolly-in",
      contextPaletteRefs: [{ source: { id: "asset-1" }, colorToken: "#0ea5e9" }],
      humanReview: { status: "verified", verificationRef: "review-1" },
      referenceRolesByKey: { subject: { source: { id: "asset-1" } } },
    });
    expect(JSON.stringify(sanitized)).not.toMatch(/blob:|data:|X-Amz-Signature|previewUrl|evidence/);
  });

  it("removes signed URLs from both absolute and relative paths", () => {
    const sanitized = sanitizeVideoGenerationParams({
      assetId: "asset-1",
      absolute: "https://cdn.test/video.webp?X-Amz-Signature=secret",
      relative: "/assets/video.webp?X-Amz-Signature=secret",
    });

    expect(sanitized).toEqual({ assetId: "asset-1" });
  });

  it("never exposes transient values through returned or persisted diagnostics", () => {
    const result = normalizeVideoGenerationParams({
      params: {
        videoGeneration: {
          referenceRolesByKey: {
            subject: {
              role: "subject",
              source: {
                kind: "unsupported",
                id: "/assets/video.webp?X-Amz-Signature=secret",
                upload: new File(["preview"], "preview.webp", { type: "image/webp" }),
              },
            },
          },
        },
      },
    });
    const persistedDiagnostics = result.params.normalization?.diagnostics ?? [];

    expect(result.diagnostics).toHaveLength(1);
    expect(persistedDiagnostics).toEqual(result.diagnostics);
    for (const diagnostic of [...result.diagnostics, ...persistedDiagnostics]) {
      expect(diagnostic.value).not.toHaveProperty("source.id");
      expect(diagnostic.value).not.toHaveProperty("source.upload");
      expect(JSON.stringify(diagnostic)).not.toMatch(/X-Amz-Signature|preview\.webp/);
    }
  });

  it("removes Blob and File-like values instead of serializing empty objects", () => {
    const sanitized = sanitizeVideoGenerationParams({
      stableAssetId: "asset-1",
      localUpload: new Blob(["preview"], { type: "image/webp" }),
    }) as Record<string, unknown>;

    expect(sanitized).toEqual({ stableAssetId: "asset-1" });
  });
});
