import type { VideoGenerationCapabilities } from "../../video-generation-contract.js";
import type { AiPluginManifest } from "../plugin-manifest.js";

const empty = { maxAudios: 0, maxImages: 0, maxTotal: 0, maxVideos: 0, minAudios: 0, minImages: 0, minVideos: 0 };
const params = (mode: "text_to_video" | "image_to_video" | "image_reference" | "first_last_frame" | "all_reference", aspectRatio: "16:9" | "9:16" | "4:3" | "1:1" | "3:4" | "21:9", resolution: "720P" | "1080P", durationSeconds: number, generateAudio = true) => ({ aspectRatio, count: 1 as const, durationSeconds, generateAudio, mode, resolution });

const gemini: VideoGenerationCapabilities = {
  aspectRatios: ["16:9", "9:16"], audioControlMode: "always_on_implicit", confirmedByRoute: true,
  defaults: params("text_to_video", "16:9", "720P", 4), durationStepSeconds: 2,
  maxAudios: 0, maxCount: 1, maxDurationSeconds: 10, maxImages: 5, maxPromptLength: null, maxTotal: 6, maxVideos: 1, minDurationSeconds: 4,
  modeConstraints: {
    all_reference: { maxAudios: 0, maxImages: 5, maxTotal: 6, maxVideos: 1, minVideos: 1 },
    image_reference: { maxAudios: 0, maxImages: 5, maxTotal: 5, maxVideos: 0, minImages: 2 },
    image_to_video: { maxAudios: 0, maxImages: 1, maxTotal: 1, maxVideos: 0, minImages: 1 }, text_to_video: empty,
  }, referenceSemantics: "style_images_and_source_video", resolutions: ["720P", "1080P"], supportedDurations: [4, 6, 8, 10], supportedModes: ["text_to_video", "image_to_video", "image_reference", "all_reference"],
};

const sora: VideoGenerationCapabilities = {
  aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], audioControlMode: "toggle", confirmedByRoute: true,
  defaults: params("text_to_video", "16:9", "720P", 4), durationStepSeconds: 1,
  maxAudios: 3, maxCount: 1, maxDurationSeconds: 15, maxImages: 9, maxPromptLength: 2500, maxTotal: 12, maxVideos: 3, minDurationSeconds: 4,
  modeConstraints: {
    all_reference: { maxAudios: 3, maxImages: 9, maxTotal: 12, maxVideos: 3, requiresVideoOrAudio: true, requiresVisualWithAudio: true },
    image_reference: { maxAudios: 0, maxImages: 9, maxTotal: 9, maxVideos: 0, minImages: 2 },
    image_to_video: { maxAudios: 0, maxImages: 1, maxTotal: 1, maxVideos: 0, minImages: 1 }, text_to_video: empty,
  }, referenceSemantics: "mixed_reference_media", resolutions: ["720P"], supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], supportedModes: ["text_to_video", "image_to_video", "image_reference", "all_reference"],
};

const veo: VideoGenerationCapabilities = {
  aspectRatios: ["16:9", "9:16"], audioControlMode: "always_on_implicit", confirmedByRoute: true,
  defaults: params("text_to_video", "16:9", "1080P", 4), durationStepSeconds: 2,
  maxAudios: 0, maxCount: 1, maxDurationSeconds: 8, maxImages: 2, maxPromptLength: null, maxTotal: 2, maxVideos: 0, minDurationSeconds: 4,
  modeConstraints: { first_last_frame: { maxAudios: 0, maxImages: 2, maxTotal: 2, maxVideos: 0, minImages: 2 }, image_to_video: { maxAudios: 0, maxImages: 1, maxTotal: 1, maxVideos: 0, minImages: 1 }, text_to_video: empty },
  referenceSemantics: "ordered_first_last_frames", resolutions: ["720P", "1080P"], supportedDurations: [4, 6, 8], supportedModes: ["text_to_video", "image_to_video", "first_last_frame"],
};

const route = (modelKey: string, modelFamily: string, capabilities: VideoGenerationCapabilities): AiPluginManifest["routes"][number] => ({
  mode: "async", modality: "video", modelFamily, modelKey, path: "/v1/videos", priority: 10,
  requestConfig: { apiMode: "async", capabilities: { ...capabilities, supportedVideoWorkflows: ["video_generation"] }, environment: "production", pollIntervalMs: 12000, pollPathTemplate: "/v1/videos/{task_id}", providerTaskTimeoutMs: 1800000, requestPath: "/v1/videos", requireExactPricing: true, supportedVideoWorkflows: ["video_generation"], upstreamModel: modelKey },
  routeKey: `video.pixelhub.${modelKey}`, routeLabel: "线路一", timeoutMs: 120000,
});
const model = (modelKey: string, displayName: string, modelFamily: string, capabilities: VideoGenerationCapabilities, sortOrder: number): AiPluginManifest["models"][number] => ({ capabilities, defaultRouteKey: `video.pixelhub.${modelKey}`, displayName, modality: "video", modelFamily, modelKey, publishToCatalog: true, sortOrder, uiSchema: { fields: [], panelLayout: "video" } });
const price = (modelKey: string, unitCredits: number, minChargeCredits: number): AiPluginManifest["pricing"][number] => ({ metadata: { billingBasis: "duration_second", source: "pixelhub.video" }, minChargeCredits, model: modelKey, provider: "pixelhub", route: `video.pixelhub.${modelKey}`, unit: "video_generation", unitCredits });

export const pixelHubVideoManifest: AiPluginManifest = {
  credentialBindings: [
    { bindingKey: "gemini-omni-flash", label: "Gemini Omni Flash", modelKey: "gemini-omni-flash", routeKey: "video.pixelhub.gemini-omni-flash" },
    { bindingKey: "sora-v3-pro", label: "Sora V3 Pro", modelKey: "sora-v3-pro", routeKey: "video.pixelhub.sora-v3-pro" },
    { bindingKey: "veo31-fast", label: "Veo 3.1 Fast", modelKey: "veo31-fast", routeKey: "video.pixelhub.veo31-fast" },
  ],
  credentials: { fields: [{ key: "apiKey", label: "Bearer API Key", required: true, secret: true }], type: "bearer" },
  description: "PixelHub asynchronous video generation.", displayName: "PixelHub Video", modality: "video", packageKey: "pixelhub.video", version: "1.0.0",
  provider: { capabilities: { requiresBaseUrlOverride: true, supportedVideoWorkflows: ["video_generation"] }, defaultBaseUrl: "", key: "pixelhub", kind: "pixelhub-video", name: "PixelHub" },
  models: [model("gemini-omni-flash", "Gemini Omni Flash", "pixelhub-gemini-omni-flash", gemini, 10), model("sora-v3-pro", "Sora V3 Pro", "pixelhub-sora-v3-pro", sora, 20), model("veo31-fast", "Veo 3.1 Fast", "pixelhub-veo31-fast", veo, 30)],
  routes: [route("gemini-omni-flash", "pixelhub-gemini-omni-flash", gemini), route("sora-v3-pro", "pixelhub-sora-v3-pro", sora), route("veo31-fast", "pixelhub-veo31-fast", veo)],
  pricing: [price("gemini-omni-flash", 1, 4), price("sora-v3-pro", 10, 40), price("veo31-fast", 0.5, 2)],
  tests: ["gemini-omni-flash", "sora-v3-pro", "veo31-fast"].map((modelKey) => ({ expected: { status: "waiting_provider" as const }, key: `${modelKey}-text-to-video`, label: `${modelKey} text-to-video smoke`, request: { params: params("text_to_video", "16:9", modelKey === "veo31-fast" ? "1080P" : "720P", 4), prompt: "A slow cinematic camera movement across a city skyline" }, routeKey: `video.pixelhub.${modelKey}` })),
};
