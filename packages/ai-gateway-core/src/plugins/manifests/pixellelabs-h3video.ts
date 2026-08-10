import type { VideoGenerationCapabilities } from "../../video-generation-contract.js";
import type { AiPluginManifest } from "../plugin-manifest.js";

const empty = { maxAudios: 0, maxImages: 0, maxTotal: 0, maxVideos: 0, minAudios: 0, minImages: 0, minVideos: 0 };
const params = (mode: "text_to_video" | "image_to_video" | "image_reference" | "all_reference") => ({ aspectRatio: "16:9" as const, count: 1 as const, durationSeconds: 15, generateAudio: true, mode, resolution: "2K" as const });

const capabilities: VideoGenerationCapabilities = {
  aspectRatios: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
  audioControlMode: "unsupported", confirmedByRoute: true, defaults: params("text_to_video"), durationStepSeconds: 15,
  maxAudios: 3, maxCount: 1, maxDurationSeconds: 15, maxImages: 9, maxPromptLength: null, maxTotal: 12, maxVideos: 3, minDurationSeconds: 15,
  modeConstraints: {
    all_reference: { maxAudios: 3, maxImages: 9, maxTotal: 12, maxVideos: 3, requiresVisualWithAudio: true },
    image_reference: { maxAudios: 0, maxImages: 9, maxTotal: 9, maxVideos: 0, minImages: 1 },
    image_to_video: { maxAudios: 0, maxImages: 1, maxTotal: 1, maxVideos: 0, minImages: 1 },
    text_to_video: empty,
  },
  referenceSemantics: "mixed_reference_media", resolutions: ["2K"], supportedDurations: [15],
  supportedModes: ["text_to_video", "image_to_video", "image_reference", "all_reference"],
};

const routeKey = "video.pixellelabs.h3video-2k";

export const pixelleLabsH3VideoManifest: AiPluginManifest = {
  credentialBindings: [{ bindingKey: "h3video-2k", label: "H3video-2k", modelKey: "H3video-2k", routeKey }],
  credentials: { fields: [{ key: "apiKey", label: "Bearer API Key", required: true, secret: true }], type: "bearer" },
  description: "PixelleLabs H3video-2k asynchronous video generation.", displayName: "PixelleLabs H3video-2k", modality: "video", packageKey: "pixellelabs.h3video", version: "1.0.0",
  provider: { capabilities: { requiresBaseUrlOverride: false, supportedVideoWorkflows: ["video_generation"] }, defaultBaseUrl: "https://api.pixellelabs.com", key: "pixellelabs-h3video", kind: "pixellelabs-h3video", name: "PixelleLabs H3video" },
  models: [{ capabilities, defaultRouteKey: routeKey, displayName: "H3video-2k", modality: "video", modelFamily: "pixellelabs-h3video-2k", modelKey: "H3video-2k", publishToCatalog: true, sortOrder: 40, uiSchema: { creatorLabel: "H3video-2k", fields: [], panelLayout: "video" } }],
  routes: [{ mode: "async", modality: "video", modelFamily: "pixellelabs-h3video-2k", modelKey: "H3video-2k", path: "/v1/videos", priority: 10, requestConfig: { apiMode: "async", capabilities: { ...capabilities, supportedVideoWorkflows: ["video_generation"] }, environment: "production", pollIntervalMs: 12000, pollPathTemplate: "/v1/videos/{task_id}", providerTaskTimeoutMs: 1800000, requestPath: "/v1/videos", requireExactPricing: true, supportedVideoWorkflows: ["video_generation"], upstreamModel: "H3video-2k" }, routeKey, routeLabel: "线路一", timeoutMs: 120000 }],
  pricing: [{ metadata: { billingBasis: "duration_second", source: "pixellelabs.h3video" }, minChargeCredits: 10, model: "H3video-2k", provider: "pixellelabs-h3video", route: routeKey, unit: "video_generation", unitCredits: 1 }],
  tests: [{ expected: { status: "waiting_provider" }, key: "h3video-2k-text-to-video", label: "H3video-2k text-to-video smoke", request: { params: params("text_to_video"), prompt: "A slow cinematic camera movement across a city skyline" }, routeKey }],
};
