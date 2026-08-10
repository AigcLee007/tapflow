import { describe, expect, test, vi } from "vitest";

import { PixelleLabsH3VideoAdapter } from "../src/pixellelabs-h3video-adapter.js";
import { pixelleLabsH3VideoManifest } from "../src/plugins/manifests/pixellelabs-h3video.js";
import type { AssetReferenceInput, ProviderCallContext, VideoGenerationRequest } from "../src/types.js";

const media = (kind: "image" | "video" | "audio", role: string, order: number): AssetReferenceInput => ({
  assetId: `${kind}-${order}`,
  kind,
  metadata: {
    signedUrl: `https://signed.test/${kind}-${order}`,
    videoReference: { mediaKind: kind, order, referenceKey: `${kind}-${order}`, role, sourceKind: "asset", sourceNodeId: null },
  },
});

const context = (mode: VideoGenerationRequest["params"]["mode"]): ProviderCallContext => ({
  apiKey: "h3-secret",
  baseUrl: "https://api.pixellelabs.com",
  modelKey: "h3video-2k",
  providerKey: "pixellelabs-h3video",
  requestConfig: {
    capabilities: pixelleLabsH3VideoManifest.routes[0]!.requestConfig.capabilities,
    pollIntervalMs: 100,
    pollPathTemplate: "/v1/videos/{task_id}",
    providerTaskTimeoutMs: 1000,
    requestPath: "/v1/videos",
    upstreamModel: "H3video-2k",
  },
  routeId: "route",
  routeKey: "video.pixellelabs.h3video-2k",
  timeoutMs: 30000,
});

const request = (mode: VideoGenerationRequest["params"]["mode"], inputAssets: AssetReferenceInput[] = []): VideoGenerationRequest => ({
  prompt: "A cinematic product shot",
  params: { aspectRatio: "16:9", count: 1, durationSeconds: 15, generateAudio: true, mode, resolution: "2K" },
  inputAssets,
});

describe("PixelleLabsH3VideoAdapter", () => {
  test("maps text-to-video to H3 fixed 2K/15-second fields", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task_id: "task-text", status: "queued" }), { status: 200 }));
    const result = await new PixelleLabsH3VideoAdapter({ fetchImplementation }).generateVideo(context("text_to_video"), request("text_to_video"));
    expect(JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body))).toEqual({ model: "H3video-2k", prompt: "A cinematic product shot", aspect_ratio: "16:9", resolution: "2K", seconds: "15" });
    expect(result).toMatchObject({ status: "waiting_provider", providerTaskId: "task-text" });
  });

  test("maps main image and additional references in documented order", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "task-images", status: "processing" }), { status: 200 }));
    await new PixelleLabsH3VideoAdapter({ fetchImplementation }).generateVideo(context("image_reference"), request("image_reference", [media("image", "reference_image", 2), media("image", "main_image", 0), media("image", "reference_image", 1)]));
    expect(JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body))).toEqual({ model: "H3video-2k", prompt: "A cinematic product shot", aspect_ratio: "16:9", resolution: "2K", seconds: "15", image_url: "https://signed.test/image-0", reference_image_urls: ["https://signed.test/image-1", "https://signed.test/image-2"] });
  });

  test("maps mixed references and polls processing to running", async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ task_id: "task-mixed", status: "queued" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task_id: "task-mixed", status: "processing", progress: 50 }), { status: 200 }));
    const mixed = request("all_reference", [media("image", "main_image", 0), media("video", "reference_video", 1), media("audio", "reference_audio", 2)]);
    const adapter = new PixelleLabsH3VideoAdapter({ fetchImplementation });
    await adapter.generateVideo(context("all_reference"), mixed);
    const result = await adapter.pollTask(context("all_reference"), { providerTaskId: "task-mixed" });
    expect(JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body))).toMatchObject({ image_url: "https://signed.test/image-0", reference_video: "https://signed.test/video-1", audio_url: "https://signed.test/audio-2" });
    expect(result.status).toBe("running");
    expect(JSON.stringify(result.providerResponse)).not.toMatch(/signed\.test|h3-secret/i);
  });

  test("parses a completed H3 task output", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "task-done", status: "completed", video_url: "https://api.pixellelabs.com/v1/videos/task-done/content" }), { status: 200 }));
    const result = await new PixelleLabsH3VideoAdapter({ fetchImplementation }).pollTask(context("text_to_video"), { providerTaskId: "task-done" });
    expect(result).toMatchObject({ status: "succeeded", outputs: [{ mimeType: "video/mp4", url: "https://api.pixellelabs.com/v1/videos/task-done/content" }] });
  });
});
