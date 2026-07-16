import { describe, expect, test } from "vitest";

import { createVideoComposerDiagnostic } from "./videoComposerDiagnostics";

describe("video composer diagnostics", () => {
  test("allows only the four event names and safe field values", () => {
    expect(createVideoComposerDiagnostic("preflight_blocked", {
      errorCode: "PRICING_NOT_FOUND",
      modelId: "video-model-1",
      motionId: "dolly-in",
    })).toEqual({
      event: "preflight_blocked",
      errorCode: "PRICING_NOT_FOUND",
      modelId: "video-model-1",
      motionId: "dolly-in",
    });
  });

  test("rejects unsafe event names and sensitive diagnostic data", () => {
    expect(createVideoComposerDiagnostic("unknown_event", { errorCode: "NO_VIDEO_GENERATION_ROUTE" })).toBeNull();
    expect(createVideoComposerDiagnostic("catalog_error", {
      errorCode: "CATALOG_LOADING",
      modelId: "video-model-1",
      motionId: "orbit",
      prompt: "a private prompt",
      provider: "secret-provider",
      routeKey: "video.private",
      signedUrl: "https://cdn.test/video.mp4?X-Amz-Signature=secret",
      secret: "do-not-log",
    })).toEqual({
      event: "catalog_error",
      errorCode: "CATALOG_LOADING",
      modelId: "video-model-1",
      motionId: "orbit",
    });
  });
});
