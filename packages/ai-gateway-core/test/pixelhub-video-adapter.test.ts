import { describe, expect, test, vi } from "vitest";

import { PixelHubVideoAdapter } from "../src/pixelhub-video-adapter.js";
import { AiGatewayError } from "../src/errors.js";
import type { AssetReferenceInput, ProviderCallContext, VideoGenerationRequest } from "../src/types.js";

const context = (model: string): ProviderCallContext => ({
  apiKey: "secret-key", baseUrl: "https://pixelhub.test", modelKey: "catalog-id", providerKey: "pixelhub",
  requestConfig: { capabilities: { aspectRatios: ["16:9"], audioControlMode: "always_on_implicit", confirmedByRoute: true, defaults: { aspectRatio: "16:9", count: 1, durationSeconds: 8, generateAudio: true, mode: "all_reference", resolution: "1080P" }, durationStepSeconds: 2, maxAudios: 0, maxCount: 1, maxDurationSeconds: 10, maxImages: 5, maxPromptLength: null, maxTotal: 6, maxVideos: 1, minDurationSeconds: 4, modeConstraints: { all_reference: { maxImages: 5, maxTotal: 6, maxVideos: 1, minVideos: 1 } }, referenceSemantics: "style_images_and_source_video", resolutions: ["1080P"], supportedDurations: [8], supportedModes: ["all_reference"] }, pollIntervalMs: 12000, pollPathTemplate: "/v1/videos/{task_id}", providerTaskTimeoutMs: 1800000, requestPath: "/v1/videos", upstreamModel: model }, routeId: "route", routeKey: "video.pixelhub.gemini-omni-flash", timeoutMs: 30000,
});

const request: VideoGenerationRequest = { prompt: "Preserve the motion and replace the subject", params: { aspectRatio: "16:9", count: 1, durationSeconds: 8, generateAudio: true, mode: "all_reference", resolution: "1080P" }, inputAssets: [
  { assetId: "image", kind: "image", metadata: { signedUrl: "https://signed.test/image", videoReference: { mediaKind: "image", order: 0, referenceKey: "image", role: "reference_image", sourceKind: "asset", sourceNodeId: null } } },
  { assetId: "video", kind: "video", metadata: { signedUrl: "https://signed.test/video", videoReference: { mediaKind: "video", order: 1, referenceKey: "video", role: "source_video", sourceKind: "asset", sourceNodeId: null } } },
] };

const media = (kind: "image" | "video" | "audio", role: string, order: number): AssetReferenceInput => ({
  assetId: `${kind}-${order}`,
  kind,
  metadata: {
    signedUrl: `https://signed.test/${kind}-${order}`,
    videoReference: { mediaKind: kind, order, referenceKey: `${kind}-${order}`, role, sourceKind: "asset", sourceNodeId: null },
  },
});

const soraContext = (): ProviderCallContext => ({
  ...context("sora-v3-pro"),
  requestConfig: {
    ...context("sora-v3-pro").requestConfig,
    capabilities: {
      ...context("sora-v3-pro").requestConfig.capabilities as Record<string, unknown>,
      audioControlMode: "toggle",
      maxAudios: 3,
      maxImages: 9,
      maxTotal: 12,
      maxVideos: 3,
      modeConstraints: { all_reference: { maxAudios: 3, maxImages: 9, maxTotal: 12, maxVideos: 3, requiresVisualWithAudio: true } },
      referenceSemantics: "mixed_reference_media",
    },
  },
});

const veoContext = (): ProviderCallContext => ({
  ...context("veo31-fast"),
  requestConfig: {
    ...context("veo31-fast").requestConfig,
    capabilities: {
      ...context("veo31-fast").requestConfig.capabilities as Record<string, unknown>,
      defaults: { aspectRatio: "16:9", count: 1, durationSeconds: 8, generateAudio: true, mode: "first_last_frame", resolution: "1080P" },
      maxImages: 2,
      maxTotal: 2,
      maxVideos: 0,
      modeConstraints: { first_last_frame: { maxImages: 2, maxTotal: 2, maxVideos: 0, minImages: 1 } },
      referenceSemantics: "ordered_first_last_frames",
      supportedModes: ["first_last_frame"],
    },
  },
});

const geminiImageToVideoContext = (): ProviderCallContext => ({
  ...context("gemini-omni-flash"),
  requestConfig: {
    ...context("gemini-omni-flash").requestConfig,
    capabilities: {
      ...context("gemini-omni-flash").requestConfig.capabilities as Record<string, unknown>,
      defaults: { aspectRatio: "16:9", count: 1, durationSeconds: 8, generateAudio: true, mode: "image_to_video", resolution: "1080P" },
      maxImages: 1,
      maxTotal: 1,
      maxVideos: 0,
      modeConstraints: { image_to_video: { maxImages: 1, maxTotal: 1, maxVideos: 0, minImages: 1 } },
      supportedModes: ["image_to_video"],
    },
  },
});

describe("PixelHubVideoAdapter", () => {
  test("maps Gemini image and source video to image_urls and video_urls without legacy aliases", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task_id: "task-1", status: "queued" }), { status: 200 }));
    const result = await new PixelHubVideoAdapter({ fetchImplementation }).generateVideo(context("gemini-omni-flash"), request);
    const body = JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ aspect_ratio: "16:9", duration: 8, image_urls: ["https://signed.test/image"], model: "gemini-omni-flash", prompt: request.prompt, resolution: "1080p", video_urls: ["https://signed.test/video"] });
    expect(body).not.toHaveProperty("reference_image_urls");
    expect(body).not.toHaveProperty("reference_videos");
    expect(result).toMatchObject({ pollIntervalMs: 12000, providerTaskId: "task-1", providerTaskTimeoutMs: 1800000, status: "waiting_provider" });
    expect(JSON.stringify(result.providerRequest)).not.toMatch(/signed\.test|secret-key/i);
  });

  test("maps Gemini image-to-video main image to the image_urls field", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task_id: "task-gemini-image", status: "queued" }), { status: 200 }));
    const imageRequest: VideoGenerationRequest = {
      ...request,
      params: { ...request.params!, mode: "image_to_video" },
      inputAssets: [media("image", "main_image", 0)],
    };

    await new PixelHubVideoAdapter({ fetchImplementation }).generateVideo(geminiImageToVideoContext(), imageRequest);

    expect(JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body))).toEqual({
      aspect_ratio: "16:9", duration: 8, image_urls: ["https://signed.test/image-0"],
      model: "gemini-omni-flash", prompt: request.prompt, resolution: "1080p",
    });
  });

  test("maps Sora visual and audio references with its explicit audio toggle", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task_id: "task-sora", status: "queued" }), { status: 200 }));
    const soraRequest: VideoGenerationRequest = {
      ...request,
      params: { ...request.params!, generateAudio: false },
      inputAssets: [media("image", "main_image", 0), media("video", "reference_video", 1), media("audio", "reference_audio", 2)],
    };

    await new PixelHubVideoAdapter({ fetchImplementation }).generateVideo(soraContext(), soraRequest);

    expect(JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body))).toEqual({
      aspect_ratio: "16:9", duration: 8, model: "sora-v3-pro", prompt: request.prompt,
      reference_image_urls: ["https://signed.test/image-0"], reference_videos: ["https://signed.test/video-1"],
      audio_urls: ["https://signed.test/audio-2"], generate_audio: false, resolution: "1080p",
    });
  });

  test("maps Veo first and last frames as ordered image URLs only", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task_id: "task-veo", status: "queued" }), { status: 200 }));
    const veoRequest: VideoGenerationRequest = {
      ...request,
      params: { ...request.params!, mode: "first_last_frame" },
      inputAssets: [media("image", "last_frame", 1), media("image", "first_frame", 0)],
    };

    await new PixelHubVideoAdapter({ fetchImplementation }).generateVideo(veoContext(), veoRequest);

    expect(JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body))).toEqual({
      aspect_ratio: "16:9", duration: 8, model: "veo31-fast", prompt: request.prompt,
      image_urls: ["https://signed.test/image-0", "https://signed.test/image-1"], resolution: "1080p",
    });
  });

  test("maps a Veo first frame without inventing a last frame", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task_id: "task-veo-single", status: "queued" }), { status: 200 }));
    const veoRequest: VideoGenerationRequest = {
      ...request,
      params: { ...request.params!, mode: "first_last_frame" },
      inputAssets: [media("image", "first_frame", 0)],
    };

    await new PixelHubVideoAdapter({ fetchImplementation }).generateVideo(veoContext(), veoRequest);

    expect(JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body))).toEqual({
      aspect_ratio: "16:9", duration: 8, model: "veo31-fast", prompt: request.prompt,
      image_urls: ["https://signed.test/image-0"], resolution: "1080p",
    });
  });

  test.each([
    ["queued", "pending"],
    ["in_progress", "running"],
    ["completed", "succeeded"],
    ["failed", "failed"],
  ] as const)("maps PixelHub %s polling status to %s", async (providerStatus, expectedStatus) => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task_id: "task-poll", status: providerStatus, progress: 50, ...(providerStatus === "completed" ? { video_url: "https://output.test/video.mp4" } : {}) }), { status: 200 }));
    const result = await new PixelHubVideoAdapter({ fetchImplementation }).pollTask(context("gemini-omni-flash"), { providerTaskId: "task-poll" });

    expect(result.status).toBe(expectedStatus);
    expect(JSON.stringify(result.providerResponse)).not.toMatch(/output\.test/);
    if (providerStatus === "completed") expect(result.outputs).toEqual([{ mimeType: "video/mp4", url: "https://output.test/video.mp4" }]);
  });

  test.each([
    [400, "PIXELHUB_REQUEST_REJECTED"],
    [401, "PROVIDER_AUTH_FAILED"],
    [403, "PROVIDER_AUTH_FAILED"],
    [429, "PROVIDER_RATE_LIMITED"],
    [500, "PROVIDER_UNAVAILABLE"],
  ] as const)("maps HTTP %i to %s without leaking response content", async (status, code) => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "secret provider response" }), { status }));

    await expect(new PixelHubVideoAdapter({ fetchImplementation }).generateVideo(context("gemini-omni-flash"), request)).rejects.toMatchObject({ code });
  });

  test("maps a timeout once and keeps a sanitized create summary", async () => {
    const timeout = Object.assign(new Error("request aborted"), { name: "AbortError" });
    const fetchImplementation = vi.fn().mockRejectedValue(timeout);

    await expect(new PixelHubVideoAdapter({ fetchImplementation }).generateVideo(context("gemini-omni-flash"), request)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AiGatewayError);
      expect((error as AiGatewayError).code).toBe("PROVIDER_TIMEOUT");
      expect((error as AiGatewayError).providerRequest).toEqual({
        aspectRatio: "16:9", duration: 8, generateAudio: "implicit", model: "gemini-omni-flash",
        referenceCounts: { audios: 0, images: 1, videos: 1 }, resolution: "1080p",
      });
      expect(JSON.stringify((error as AiGatewayError).providerRequest)).not.toMatch(/signed\.test|secret-key|authorization/i);
      return true;
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
