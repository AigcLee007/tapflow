import type { AiPluginManifest } from "../plugin-manifest.js";

const aspectRatioOptions = ["1:1", "16:9", "9:16", "21:9", "4:3", "3:4", "3:2", "2:3"].map((value) => ({
  label: value,
  value,
}));

export const visionaryNanoBananaManifest: AiPluginManifest = {
  credentials: {
    envKeys: ["VISIONARY_API_KEY"],
    fields: [
      {
        key: "apiKey",
        label: "Visionary API Key",
        placeholder: "Bearer token",
        required: true,
        secret: true,
      },
    ],
    type: "bearer",
  },
  description: "Visionary Nano Banana Pro image generation.",
  displayName: "Nano Banana Pro",
  modality: "image",
  models: [
    {
      capabilities: {
        maxInputImages: 9,
        supportedAspectRatios: aspectRatioOptions.map((option) => String(option.value)),
        supportedSizes: ["2K", "4K"],
        supportsReferenceImages: true,
      },
      defaultRouteKey: "image.nano-banana-pro",
      displayName: "Nano Banana Pro",
      modality: "image",
      modelFamily: "nano-banana-pro",
      modelKey: "nano-banana-pro",
      sortOrder: 10,
      uiSchema: {
        fields: [
          {
            defaultValue: "1:1",
            key: "aspectRatio",
            label: "比例",
            mapsTo: "request.metadata",
            options: aspectRatioOptions,
            required: false,
            type: "select",
          },
          {
            defaultValue: "2K",
            key: "imageSize",
            label: "分辨率",
            mapsTo: "request.metadata",
            options: [
              { label: "2K 稳定线路", value: "2K" },
              { label: "4K 高清线路", value: "4K" },
            ],
            required: false,
            type: "select",
          },
          {
            defaultValue: false,
            key: "optimizeChineseText",
            label: "AI 增强中文",
            mapsTo: "request.metadata",
            required: false,
            type: "boolean",
          },
        ],
        panelLayout: "nano-banana",
      },
    },
    {
      capabilities: {
        maxInputImages: 9,
        supportedAspectRatios: aspectRatioOptions.map((option) => String(option.value)),
        supportedSizes: ["2K", "4K"],
        supportsReferenceImages: true,
      },
      defaultRouteKey: "image.nano-banana-pro-fast",
      displayName: "Nano Banana Pro Fast",
      modality: "image",
      modelFamily: "nano-banana-pro-fast",
      modelKey: "nano-banana-pro-fast",
      sortOrder: 20,
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
            options: [
              { label: "2K 稳定线路", value: "2K" },
              { label: "4K 高清线路", value: "4K" },
            ],
            type: "select",
          },
        ],
        panelLayout: "nano-banana",
      },
    },
  ],
  packageKey: "visionary.nano-banana",
  pricing: [
    {
      metadata: {
        optimizeChineseTextExtraCredits: 8,
        source: "visionary-nano-banana",
      },
      minChargeCredits: 24,
      model: "nano-banana-pro",
      provider: "visionary",
      route: "image.nano-banana-pro",
      unit: "image_generation",
      unitCredits: 24,
    },
    {
      metadata: {
        source: "visionary-nano-banana",
      },
      minChargeCredits: 48,
      model: "nano-banana-pro-fast",
      provider: "visionary",
      route: "image.nano-banana-pro-fast",
      unit: "image_generation",
      unitCredits: 48,
    },
  ],
  provider: {
    capabilities: {
      supportedModels: ["nano-banana-pro", "nano-banana-pro-fast"],
      supportsImageGeneration: true,
      supportsReferenceImages: true,
      timeoutMs: 300000,
    },
    defaultBaseUrl: "https://visionary.beer",
    key: "visionary",
    kind: "visionary-nano-banana",
    name: "Visionary",
  },
  routes: [
    {
      mode: "sync",
      modality: "image",
      modelFamily: "nano-banana-pro",
      modelKey: "nano-banana-pro",
      path: "/v1/api/nano-banana",
      priority: 10,
      requestConfig: {
        path: "/v1/api/nano-banana",
        replyType: "json",
        timeoutMs: 300000,
      },
      routeKey: "image.nano-banana-pro",
      routeLabel: "Visionary 稳定线路",
      timeoutMs: 300000,
    },
    {
      mode: "sync",
      modality: "image",
      modelFamily: "nano-banana-pro-fast",
      modelKey: "nano-banana-pro-fast",
      path: "/v1/api/nano-banana",
      priority: 10,
      requestConfig: {
        path: "/v1/api/nano-banana",
        replyType: "json",
        timeoutMs: 300000,
      },
      routeKey: "image.nano-banana-pro-fast",
      routeLabel: "Visionary 快速线路",
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
          optimizeChineseText: false,
        },
        prompt: "一张简洁的中文海报，白色背景，黑色标题：测试成功",
      },
      routeKey: "image.nano-banana-pro",
    },
  ],
  version: "1.0.0",
};
