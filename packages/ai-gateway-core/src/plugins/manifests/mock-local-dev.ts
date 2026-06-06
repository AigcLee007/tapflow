import type { AiPluginManifest } from "../plugin-manifest.js";

export const mockLocalDevManifest: AiPluginManifest = {
  credentials: {
    fields: [
      {
        key: "apiKey",
        label: "Mock API Key",
        placeholder: "mock-local-dev-secret",
        required: true,
        secret: true,
      },
    ],
    type: "bearer",
  },
  description: "Local development mock image and video generation routes.",
  displayName: "Mock Local Dev",
  modality: "image",
  models: [
    {
      capabilities: {
        supportsReferenceImages: false,
      },
      defaultRouteKey: "image.default",
      displayName: "Mock Image v1",
      modality: "image",
      modelFamily: "mock-image",
      modelKey: "mock-image-v1",
      sortOrder: 1000,
      uiSchema: {
        fields: [],
        panelLayout: "compact",
      },
    },
  ],
  packageKey: "mock.local-dev.image",
  pricing: [
    {
      metadata: {
        localDevOnly: true,
      },
      minChargeCredits: 10,
      model: "mock-image-v1",
      provider: "mock-local-dev",
      route: "image.default",
      unit: "image_generation",
      unitCredits: 10,
    },
    {
      metadata: {
        localDevOnly: true,
      },
      minChargeCredits: 10,
      model: "mock-image-v1",
      provider: "mock-local-dev",
      route: "image.fail",
      unit: "image_generation",
      unitCredits: 10,
    },
  ],
  provider: {
    capabilities: {
      localDevOnly: true,
      supportsFailureSimulation: true,
      supportsImageGeneration: true,
    },
    defaultBaseUrl: "mock://local",
    key: "mock-local-dev",
    kind: "mock",
    name: "Mock Local Dev Provider",
  },
  routes: [
    {
      mode: "sync",
      modality: "image",
      modelFamily: "mock-image",
      modelKey: "mock-image-v1",
      priority: 1000,
      requestConfig: {
        environment: "development",
        localDevOnly: true,
        mockMode: "success",
      },
      routeKey: "image.default",
      routeLabel: "Mock 成功线路",
      timeoutMs: 10000,
    },
    {
      mode: "sync",
      modality: "image",
      modelFamily: "mock-image",
      modelKey: "mock-image-v1",
      priority: 1000,
      requestConfig: {
        environment: "development",
        localDevOnly: true,
        mockMode: "fail",
      },
      routeKey: "image.fail",
      routeLabel: "Mock 失败线路",
      timeoutMs: 10000,
    },
  ],
  tests: [
    {
      expected: {
        minOutputs: 1,
        status: "succeeded",
      },
      key: "mock-success",
      label: "Mock 成功测试",
      request: {
        prompt: "mock image",
      },
      routeKey: "image.default",
    },
  ],
  version: "1.0.0",
};
