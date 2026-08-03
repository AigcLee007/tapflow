import { describe, expect, test, vi } from "vitest";

import { PixelHubVideoAdapter } from "../src/pixelhub-video-adapter.js";
import type { ProviderCallContext, VideoGenerationRequest } from "../src/types.js";

const context = (model: string): ProviderCallContext => ({
  apiKey: "secret-key", baseUrl: "https://pixelhub.test", modelKey: "catalog-id", providerKey: "pixelhub",
  requestConfig: { capabilities: { aspectRatios: ["16:9"], audioControlMode: "always_on_implicit", confirmedByRoute: true, defaults: { aspectRatio: "16:9", count: 1, durationSeconds: 8, generateAudio: true, mode: "all_reference", resolution: "1080P" }, durationStepSeconds: 2, maxAudios: 0, maxCount: 1, maxDurationSeconds: 10, maxImages: 5, maxPromptLength: null, maxTotal: 6, maxVideos: 1, minDurationSeconds: 4, modeConstraints: { all_reference: { maxImages: 5, maxTotal: 6, maxVideos: 1, minVideos: 1 } }, referenceSemantics: "style_images_and_source_video", resolutions: ["1080P"], supportedDurations: [8], supportedModes: ["all_reference"] }, pollIntervalMs: 12000, pollPathTemplate: "/v1/videos/{task_id}", providerTaskTimeoutMs: 1800000, requestPath: "/v1/videos", upstreamModel: model }, routeId: "route", routeKey: "video.pixelhub.gemini-omni-flash", timeoutMs: 30000,
});

const request: VideoGenerationRequest = { prompt: "Preserve the motion and replace the subject", params: { aspectRatio: "16:9", count: 1, durationSeconds: 8, generateAudio: true, mode: "all_reference", resolution: "1080P" }, inputAssets: [
  { assetId: "image", kind: "image", metadata: { signedUrl: "https://signed.test/image", videoReference: { mediaKind: "image", order: 0, referenceKey: "image", role: "main_image", sourceKind: "asset", sourceNodeId: null } } },
  { assetId: "video", kind: "video", metadata: { signedUrl: "https://signed.test/video", videoReference: { mediaKind: "video", order: 1, referenceKey: "video", role: "source_video", sourceKind: "asset", sourceNodeId: null } } },
] };

describe("PixelHubVideoAdapter", () => {
  test("maps Gemini input to canonical PixelHub fields without leaking URLs in summaries", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task_id: "task-1", status: "queued" }), { status: 200 }));
    const result = await new PixelHubVideoAdapter({ fetchImplementation }).generateVideo(context("gemini-omni-flash"), request);
    expect(JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body))).toEqual({ aspect_ratio: "16:9", duration: 8, model: "gemini-omni-flash", prompt: request.prompt, reference_image_urls: ["https://signed.test/image"], reference_videos: ["https://signed.test/video"], resolution: "1080p" });
    expect(result).toMatchObject({ pollIntervalMs: 12000, providerTaskId: "task-1", providerTaskTimeoutMs: 1800000, status: "waiting_provider" });
    expect(JSON.stringify(result.providerRequest)).not.toMatch(/signed\.test|secret-key/i);
  });
});
