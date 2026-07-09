import type { AiPluginManifest } from "../plugin-manifest.js";

const aspectRatioOptions = ["1:1", "16:9", "9:16", "21:9", "2:1", "4:3", "3:4", "3:2", "2:3"].map((value) => ({
  label: value,
  value,
}));

const imageSizeOptions = ["1K", "2K", "4K"].map((value) => ({
  label: value,
  value,
}));

const modelBySize = {
  "1K": "gemini-3.1-flash-image-preview",
  "2K": "gemini-3.1-flash-image-preview-2k",
  "4K": "gemini-3.1-flash-image-preview-4k",
};

const sizeTiers = {
  "1K": 6,
  "2K": 8,
  "4K": 12,
};

export const mouxiHubNanoBananaProT3Manifest: AiPluginManifest = {
  credentials: {
    envKeys: ["MOUXIHUB_API_KEY"],
    fields: [
      {
        key: "apiKey",
        label: "MouxiHub API Key",
        placeholder: "sk-...",
        required: true,
        secret: true,
      },
    ],
    type: "bearer",
  },
  description: "Nano Banana Pro official T3 async image generation through MouxiHub OpenAI-compatible API.",
  displayName: "Nano Banana Pro",
  modality: "image",
  models: [
    {
      capabilities: {
        maxInputImages: 10,
        supportedAspectRatios: aspectRatioOptions.map((option) => String(option.value)),
        supportedSizes: imageSizeOptions.map((option) => String(option.value)),
        supportsImageEdit: true,
        supportsReferenceImages: true,
      },
      defaultRouteKey: "image.mouxihub.nano-banana-pro.t3",
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
            defaultValue: "1K",
            key: "imageSize",
            label: "分辨率",
            mapsTo: "request.params",
            options: imageSizeOptions,
            type: "select",
          },
        ],
        panelLayout: "nano-banana",
      },
    },
  ],
  packageKey: "mouxihub.nano-banana-pro-t3",
  pricing: [
    {
      metadata: {
        modelBySize,
        sizeTiers,
        source: "mouxihub-nano-banana-pro-t3",
      },
      minChargeCredits: 6,
      model: "gemini-3-pro-image-preview",
      provider: "mouxihub-openai",
      route: "image.mouxihub.nano-banana-pro.t3",
      unit: "image_generation",
      unitCredits: 6,
    },
  ],
  provider: {
    capabilities: {
      supportsAsyncTasks: true,
      supportsImageGeneration: true,
      supportsReferenceImages: true,
      timeoutMs: 300000,
    },
    defaultBaseUrl: "https://api.mouxihub.com",
    key: "mouxihub-openai",
    kind: "openai-compatible",
    name: "MouxiHub OpenAI Compatible",
  },
  routes: [
    {
      mode: "async",
      modality: "image",
      modelFamily: "pixellelabs.nano-banana-pro",
      modelKey: "gemini-3-pro-image-preview",
      path: "/v1/images/generations",
      priority: 20,
      requestConfig: {
        async: true,
        editPath: "/v1/images/edits",
        modelBySize,
        outputFormat: "png",
        path: "/v1/images/generations",
        pollPath: "/v1/images/tasks/{task_id}",
        responseFormat: null,
        sizeTiers,
        timeoutMs: 300000,
      },
      routeKey: "image.mouxihub.nano-banana-pro.t3",
      routeLabel: "线路二（官方T3）",
      timeoutMs: 300000,
    },
  ],
  tests: [
    {
      expected: {
        status: "waiting_provider",
      },
      key: "basic-async-image",
      label: "基础异步生图测试",
      request: {
        metadata: {
          params: {
            size: "1K",
          },
        },
        prompt: "生成一张简洁的中文测试海报，白色背景，黑色标题：OK。",
      },
      routeKey: "image.mouxihub.nano-banana-pro.t3",
    },
  ],
  version: "1.0.0",
};
