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

  test("rejects sensitive values disguised as diagnostic identifiers", () => {
    expect(createVideoComposerDiagnostic("catalog_error", {
      errorCode: "MANIFEST_LOAD_FAILED",
      modelId: "/assets/video.mp4?X-Amz-Signature=temporary-secret",
      motionId: "provider-private-model",
    })).toEqual({
      event: "catalog_error",
      errorCode: "MANIFEST_LOAD_FAILED",
    });

    expect(createVideoComposerDiagnostic("catalog_error", {
      errorCode: "PRIVATE_PROMPT",
      modelId: "route-key-video-model",
      motionId: "dolly-in",
    })).toEqual({
      event: "catalog_error",
      motionId: "dolly-in",
    });
  });

  test("rejects credential-shaped identifiers while retaining normal model and motion IDs", () => {
    expect(createVideoComposerDiagnostic("catalog_error", {
      errorCode: "CATALOG_LOADING",
      modelId: "sk-live-abc",
      motionId: "AIzaSyDUMMYkey_1234567890",
    })).toEqual({
      event: "catalog_error",
      errorCode: "CATALOG_LOADING",
    });

    expect(createVideoComposerDiagnostic("catalog_error", {
      modelId: "api_key_live_abc",
      motionId: "bearer_live_abc",
    })).toEqual({ event: "catalog_error" });

    expect(createVideoComposerDiagnostic("catalog_error", {
      modelId: "aB3dE5fG7hI9jK1lM2nO4pQ6rS8tU0vW2xY4zA6bC8dE0fG2",
    })).toEqual({ event: "catalog_error" });

    expect(createVideoComposerDiagnostic("catalog_error", {
      modelId: "seedance-1.5-pro",
      motionId: "dolly-in",
    })).toEqual({
      event: "catalog_error",
      modelId: "seedance-1.5-pro",
      motionId: "dolly-in",
    });
  });

  test("preserves the known fail-closed blocker codes", () => {
    expect(createVideoComposerDiagnostic("preflight_blocked", {
      errorCode: "NO_VIDEO_GENERATION_ROUTE",
    })).toEqual({
      event: "preflight_blocked",
      errorCode: "NO_VIDEO_GENERATION_ROUTE",
    });
  });
});
