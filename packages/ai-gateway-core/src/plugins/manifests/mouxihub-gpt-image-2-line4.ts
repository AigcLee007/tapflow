import type { AiPluginManifest } from "../plugin-manifest.js";

const sizeOptions = ["1K", "2K", "4K"].map((value) => ({
  label: value,
  value,
}));

const qualityOptions = [
  { label: "自动", value: "auto" },
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" },
];

const outputFormatOptions = [
  { label: "PNG", value: "png" },
  { label: "JPEG", value: "jpeg" },
  { label: "WEBP", value: "webp" },
];

const moderationOptions = [
  { label: "自动", value: "auto" },
  { label: "低", value: "low" },
];

const modelBySize = {
  "1K": "gpt-image-2-vip",
  "2K": "gpt-image-2-vip-2k",
  "4K": "gpt-image-2-vip-4k",
};

const sizeTiers = {
  "1K": 3,
  "2K": 4,
  "4K": 5,
};

const sharedUiFields = [
  {
    defaultValue: "1K",
    key: "size",
    label: "尺寸档位",
    mapsTo: "request.params" as const,
    options: sizeOptions,
    type: "select" as const,
  },
  {
    defaultValue: "auto",
    key: "quality",
    label: "质量",
    mapsTo: "request.params" as const,
    options: qualityOptions,
    type: "select" as const,
  },
  {
    defaultValue: "png",
    key: "outputFormat",
    label: "输出格式",
    mapsTo: "request.params" as const,
    options: outputFormatOptions,
    type: "select" as const,
  },
  {
    defaultValue: "auto",
    key: "moderation",
    label: "审核强度",
    mapsTo: "request.params" as const,
    options: moderationOptions,
    type: "select" as const,
  },
];

export const mouxiHubGptImage2Line4Manifest: AiPluginManifest = {
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
  description: "GPT-Image-2 line 4 async generation through MouxiHub OpenAI-compatible image API.",
  displayName: "GPT-Image-2 线路四",
  modality: "image",
  models: [
    {
      capabilities: {
        maxInputImages: 10,
        supportedSizes: ["1K", "2K", "4K"],
        supportsImageEdit: true,
        supportsReferenceImages: true,
      },
      defaultRouteKey: "image.gpt-image-2.line4",
      displayName: "GPT-Image-2",
      modality: "image",
      modelFamily: "gpt-image-2",
      modelKey: "gpt-image-2",
      publishToCatalog: false,
      sortOrder: 40,
      uiSchema: {
        fields: sharedUiFields,
        panelLayout: "default",
      },
    },
  ],
  packageKey: "mouxihub.gpt-image-2-line4",
  pricing: [
    {
      metadata: {
        modelBySize,
        sizeTiers,
        source: "mouxihub-gpt-image-2-line4",
      },
      minChargeCredits: 3,
      model: "gpt-image-2",
      provider: "mouxihub-openai",
      route: "image.gpt-image-2.line4",
      unit: "image_generation",
      unitCredits: 3,
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
      modelFamily: "gpt-image-2",
      modelKey: "gpt-image-2",
      path: "/v1/images/generations",
      priority: 40,
      requestConfig: {
        async: true,
        defaultSize: "1K",
        editPath: "/v1/images/edits",
        imageFieldName: "image",
        modelBySize,
        outputFormat: "png",
        path: "/v1/images/generations",
        pollPath: "/v1/images/tasks/{task_id}",
        providerBaseModel: "gpt-image-2-vip",
        responseFormat: null,
        sizeTiers,
        timeoutMs: 300000,
      },
      routeKey: "image.gpt-image-2.line4",
      routeLabel: "线路四",
      timeoutMs: 300000,
    },
  ],
  tests: [
    {
      expected: {
        status: "waiting_provider",
      },
      key: "basic-async-image-line4",
      label: "基础异步生图测试（线路四）",
      request: {
        metadata: {
          params: {
            size: "1K",
          },
        },
        prompt: "生成一张简洁的中文测试海报，白色背景，黑色标题，OK。",
      },
      routeKey: "image.gpt-image-2.line4",
    },
  ],
  version: "1.0.0",
};
