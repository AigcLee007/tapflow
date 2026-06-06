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
  description: "GPT-image-2 generation through an OpenAI-compatible image API.",
  displayName: "GPT-image-2",
  modality: "image",
  models: [
    {
      capabilities: {
        supportedSizes: ["auto", "1K", "2K", "4K"],
        supportsImageEdit: true,
        supportsReferenceImages: true,
      },
      defaultRouteKey: "image.gpt-image-2",
      displayName: "GPT-image-2",
      modality: "image",
      modelFamily: "gpt-image-2",
      modelKey: "gpt-image-2",
      sortOrder: 30,
      uiSchema: {
        fields: [
          {
            defaultValue: "auto",
            key: "size",
            label: "尺寸",
            mapsTo: "request.params",
            options: [
              { label: "自动", value: "auto" },
              { label: "1K", value: "1K" },
              { label: "2K", value: "2K" },
              { label: "4K", value: "4K" },
            ],
            type: "select",
          },
          {
            defaultValue: "png",
            key: "outputFormat",
            label: "输出格式",
            mapsTo: "request.params",
            options: [
              { label: "PNG", value: "png" },
              { label: "JPEG", value: "jpeg" },
              { label: "WEBP", value: "webp" },
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
    defaultBaseUrl: "https://api.openai.com/v1",
    key: "openai-compatible",
    kind: "openai-compatible",
    name: "OpenAI Compatible",
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
        outputFormat: "png",
        path: "/images/generations",
        responseFormat: "b64_json",
        timeoutMs: 300000,
      },
      routeKey: "image.gpt-image-2",
      routeLabel: "默认线路",
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
        prompt: "Generate a simple square test image with the text OK.",
      },
      routeKey: "image.gpt-image-2",
    },
  ],
  version: "1.0.0",
};
