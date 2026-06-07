import type { AiPluginManifest } from "../plugin-manifest.js";

export const openAiGptImage2Manifest: AiPluginManifest = {
  credentials: {
    envKeys: ["OPENAI_API_KEY"],
    fields: [
      {
        key: "apiKey",
        label: "OpenAI-compatible API Key",
        placeholder: "sk-...",
        required: true,
        secret: true,
      },
    ],
    type: "bearer",
  },
  description: "GPT-Image-2 generation through the SiphonLab OpenAI-compatible image API.",
  displayName: "GPT-Image-2",
  modality: "image",
  models: [
    {
      capabilities: {
        maxInputImages: 10,
        supportedSizes: ["1K", "2K", "4K"],
        supportsImageEdit: true,
        supportsReferenceImages: true,
      },
      defaultRouteKey: "image.gpt-image-2",
      displayName: "GPT-Image-2",
      modality: "image",
      modelFamily: "gpt-image-2",
      modelKey: "gpt-image-2",
      sortOrder: 30,
      uiSchema: {
        fields: [
          {
            defaultValue: "1K",
            key: "size",
            label: "\u5c3a\u5bf8\u6863\u4f4d",
            mapsTo: "request.params",
            options: [
              { label: "1K", value: "1K" },
              { label: "2K", value: "2K" },
              { label: "4K", value: "4K" },
            ],
            type: "select",
          },
          {
            defaultValue: "auto",
            key: "quality",
            label: "\u8d28\u91cf",
            mapsTo: "request.params",
            options: [
              { label: "\u81ea\u52a8", value: "auto" },
              { label: "\u4f4e", value: "low" },
              { label: "\u4e2d", value: "medium" },
              { label: "\u9ad8", value: "high" },
            ],
            type: "select",
          },
          {
            defaultValue: "png",
            key: "outputFormat",
            label: "\u8f93\u51fa\u683c\u5f0f",
            mapsTo: "request.params",
            options: [
              { label: "PNG", value: "png" },
              { label: "JPEG", value: "jpeg" },
              { label: "WEBP", value: "webp" },
            ],
            type: "select",
          },
          {
            defaultValue: "auto",
            key: "moderation",
            label: "\u5ba1\u6838\u5f3a\u5ea6",
            mapsTo: "request.params",
            options: [
              { label: "\u81ea\u52a8", value: "auto" },
              { label: "\u4f4e", value: "low" },
            ],
            type: "select",
          },
        ],
        panelLayout: "default",
      },
    },
  ],
  packageKey: "openai-compatible.gpt-image-2",
  pricing: [
    {
      metadata: {
        source: "openai-compatible-gpt-image-2",
      },
      minChargeCredits: 100,
      model: "gpt-image-2",
      provider: "openai-compatible",
      route: "image.gpt-image-2",
      unit: "image_generation",
      unitCredits: 100,
    },
  ],
  provider: {
    capabilities: {
      supportsImageGeneration: true,
      timeoutMs: 300000,
    },
    defaultBaseUrl: "https://sub.siphonlab.cn/v1",
    key: "openai-compatible",
    kind: "openai-compatible",
    name: "SiphonLab OpenAI Compatible",
  },
  routes: [
    {
      mode: "sync",
      modality: "image",
      modelFamily: "gpt-image-2",
      modelKey: "gpt-image-2",
      path: "/images/generations",
      priority: 10,
      requestConfig: {
        editPath: "/images/edits",
        outputFormat: "png",
        path: "/images/generations",
        responseFormat: "b64_json",
        timeoutMs: 300000,
      },
      routeKey: "image.gpt-image-2",
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
        prompt: "生成一张简洁的中文测试海报，白色背景，黑色标题：OK。",
      },
      routeKey: "image.gpt-image-2",
    },
  ],
  version: "1.0.0",
};
