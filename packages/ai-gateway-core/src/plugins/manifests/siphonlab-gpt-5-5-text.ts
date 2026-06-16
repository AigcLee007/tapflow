import type { AiPluginManifest } from "../plugin-manifest.js";

export const siphonLabGpt55TextManifest: AiPluginManifest = {
  credentials: {
    envKeys: ["SIPHONLAB_GPT_5_5_API_KEY"],
    fields: [
      {
        key: "apiKey",
        label: "SiphonLab GPT-5.5 API Key",
        placeholder: "sk-...",
        required: true,
        secret: true,
      },
    ],
    type: "bearer",
  },
  description: "GPT-5.5 text generation for text nodes and the Canvas Agent through SiphonLab OpenAI-compatible APIs.",
  displayName: "GPT-5.5",
  modality: "text",
  models: [
    {
      capabilities: {
        supportsStreaming: false,
      },
      defaultRouteKey: "text.gpt-5-5",
      displayName: "GPT-5.5",
      modality: "text",
      modelFamily: "gpt-5.5",
      modelKey: "gpt-5.5",
      sortOrder: 10,
      uiSchema: {
        fields: [
          {
            defaultValue: 0.7,
            key: "temperature",
            label: "Temperature",
            mapsTo: "request.params",
            max: 2,
            min: 0,
            step: 0.1,
            type: "slider",
          },
          {
            defaultValue: 2048,
            key: "maxTokens",
            label: "Max tokens",
            mapsTo: "request.params",
            max: 8192,
            min: 128,
            step: 128,
            type: "number",
          },
        ],
        panelLayout: "text",
      },
    },
  ],
  packageKey: "siphonlab.gpt-5-5-text",
  pricing: [
    {
      metadata: {
        source: "siphonlab-gpt-5-5-text",
      },
      minChargeCredits: 2,
      model: "gpt-5.5",
      provider: "siphonlab-openai-text",
      route: "text.gpt-5-5",
      unit: "text_generation",
      unitCredits: 2,
    },
  ],
  provider: {
    capabilities: {
      supportsChatCompletions: true,
      supportsResponses: true,
      timeoutMs: 60000,
    },
    defaultBaseUrl: "https://sub.siphonlab.cn",
    key: "siphonlab-openai-text",
    kind: "openai-compatible",
    name: "SiphonLab GPT-5.5 Text",
  },
  routes: [
    {
      mode: "sync",
      modality: "text",
      modelFamily: "gpt-5.5",
      modelKey: "gpt-5.5",
      path: "/v1/chat/completions",
      priority: 10,
      requestConfig: {
        chatPath: "/v1/chat/completions",
        model: "gpt-5.5",
        path: "/v1/chat/completions",
        responsesPath: "/v1/responses",
        timeoutMs: 60000,
      },
      routeKey: "text.gpt-5-5",
      routeLabel: "默认线路",
      timeoutMs: 60000,
    },
  ],
  tests: [
    {
      expected: {
        status: "succeeded",
      },
      key: "basic-chat",
      label: "基础文本测试",
      request: {
        messages: [
          {
            content: "用一句中文回答：测试成功了吗？",
            role: "user",
          },
        ],
      },
      routeKey: "text.gpt-5-5",
    },
  ],
  version: "1.0.0",
};
