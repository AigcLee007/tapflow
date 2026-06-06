import type { AiPluginManifest } from "../plugin-manifest.js";

const aspectRatioOptions = ["1:1", "16:9", "9:16", "21:9", "4:3", "3:4", "3:2", "2:3"].map((value) => ({
  label: value,
  value,
}));

const imageSizeOptions = ["1K", "2K", "4K"].map((value) => ({
  label: value,
  value,
}));

export const pixelleLabsNanoBananaProManifest: AiPluginManifest = {
  credentials: {
    envKeys: ["PIXELLELABS_NANO_BANANA_PRO_API_KEY"],
    fields: [
      {
        key: "apiKey",
        label: "Nano Banana Pro API Key",
        placeholder: "sk-...",
        required: true,
        secret: true,
      },
    ],
    type: "bearer",
  },
  description: "PixelleLabs Nano Banana Pro image generation.",
  displayName: "Nano Banana Pro",
  modality: "image",
  models: [
    {
      capabilities: {
        maxInputImages: 9,
        supportedAspectRatios: aspectRatioOptions.map((option) => String(option.value)),
        supportedSizes: imageSizeOptions.map((option) => String(option.value)),
        supportsReferenceImages: true,
      },
      defaultRouteKey: "image.pixellelabs.nano-banana-pro",
      displayName: "Nano Banana Pro",
      modality: "image",
      modelFamily: "pixellelabs.nano-banana-pro",
      modelKey: "gemini-3-pro-image-preview",
      sortOrder: 10,
      uiSchema: {
        fields: [
          {
            defaultValue: "1:1",
            key: "aspectRatio",
            label: "比例",
            mapsTo: "request.metadata",
            options: aspectRatioOptions,
            type: "select",
          },
          {
            defaultValue: "2K",
            key: "imageSize",
            label: "分辨率",
            mapsTo: "request.metadata",
            options: imageSizeOptions,
            type: "select",
          },
        ],
        panelLayout: "nano-banana",
      },
    },
  ],
  packageKey: "pixellelabs.nano-banana-pro",
  pricing: [
    {
      metadata: {
        source: "pixellelabs-nano-banana-pro",
      },
      minChargeCredits: 24,
      model: "gemini-3-pro-image-preview",
      provider: "pixellelabs",
      route: "image.pixellelabs.nano-banana-pro",
      unit: "image_generation",
      unitCredits: 24,
    },
  ],
  provider: {
    capabilities: {
      supportsImageGeneration: true,
      supportsReferenceImages: true,
      timeoutMs: 300000,
    },
    defaultBaseUrl: "https://api.pixellelabs.com",
    key: "pixellelabs",
    kind: "pixellelabs-gemini-image",
    name: "PixelleLabs",
  },
  routes: [
    {
      mode: "sync",
      modality: "image",
      modelFamily: "pixellelabs.nano-banana-pro",
      modelKey: "gemini-3-pro-image-preview",
      path: "/v1beta/models/gemini-3-pro-image-preview:generateContent",
      priority: 10,
      requestConfig: {
        path: "/v1beta/models/gemini-3-pro-image-preview:generateContent",
        timeoutMs: 300000,
      },
      routeKey: "image.pixellelabs.nano-banana-pro",
      routeLabel: "线路一",
      timeoutMs: 300000,
    },
  ],
  tests: [
    {
      expected: {
        minOutputs: 1,
        status: "succeeded",
      },
      key: "basic-image",
      label: "基础生图测试",
      request: {
        metadata: {
          aspectRatio: "1:1",
          imageSize: "2K",
        },
        prompt: "一张简洁的中文海报，白色背景，黑色标题：测试成功",
      },
      routeKey: "image.pixellelabs.nano-banana-pro",
    },
  ],
  version: "1.0.0",
};
