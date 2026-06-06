export type AiPluginModality = "text" | "image" | "video";

export type AiPluginCredentialField = {
  key: string;
  label: string;
  placeholder?: string;
  required: boolean;
  secret: boolean;
};

export type AiPluginCredentialManifest = {
  envKeys?: string[];
  fields: AiPluginCredentialField[];
  type: "bearer";
};

export type AiPluginUiField = {
  defaultValue?: unknown;
  key: string;
  label: string;
  mapsTo: "request.metadata" | "request.model" | "request.params" | "request.prompt";
  max?: number;
  min?: number;
  options?: Array<{
    label: string;
    value: boolean | number | string;
  }>;
  required?: boolean;
  step?: number;
  type: "boolean" | "number" | "select" | "slider" | "text" | "textarea";
  visibleWhen?: Record<string, unknown>;
};

export type AiPluginModelManifest = {
  capabilities: {
    maxInputImages?: number;
    maxPromptLength?: number;
    supportedAspectRatios?: string[];
    supportedSizes?: string[];
    supportsImageEdit?: boolean;
    supportsReferenceImages?: boolean;
    supportsStreaming?: boolean;
  };
  defaultRouteKey: string;
  displayName: string;
  modality: AiPluginModality;
  modelFamily: string;
  modelKey: string;
  sortOrder?: number;
  uiSchema: {
    fields: AiPluginUiField[];
    panelLayout: "compact" | "default" | "nano-banana" | "text" | "video";
  };
};

export type AiPluginRouteManifest = {
  baseUrl?: string;
  mode: "async" | "stream" | "sync";
  modality: AiPluginModality;
  modelFamily: string;
  modelKey: string;
  path?: string;
  priority: number;
  rateLimit?: Record<string, unknown>;
  requestConfig: Record<string, unknown>;
  routeKey: string;
  routeLabel: string;
  timeoutMs: number;
};

export type AiPluginPricingManifest = {
  metadata?: Record<string, unknown>;
  minChargeCredits: number;
  model: string;
  provider: string;
  route: string;
  unit: "image_generation" | "text_generation" | "video_generation";
  unitCredits: number;
};

export type AiPluginTestManifest = {
  expected: {
    minOutputs?: number;
    status: "succeeded" | "waiting_provider";
  };
  key: string;
  label: string;
  request: {
    messages?: Array<{
      content: string;
      role: "assistant" | "system" | "user";
    }>;
    metadata?: Record<string, unknown>;
    prompt?: string;
  };
  routeKey: string;
};

export type AiPluginManifest = {
  credentials: AiPluginCredentialManifest;
  description: string;
  displayName: string;
  modality: AiPluginModality;
  models: AiPluginModelManifest[];
  packageKey: string;
  pricing: AiPluginPricingManifest[];
  provider: {
    capabilities?: Record<string, unknown>;
    defaultBaseUrl: string;
    key: string;
    kind: string;
    name: string;
  };
  routes: AiPluginRouteManifest[];
  tests: AiPluginTestManifest[];
  version: string;
};

export type AiPluginManifestValidationIssue = {
  code: string;
  message: string;
};

export function validateAiPluginManifest(
  manifest: AiPluginManifest,
): AiPluginManifestValidationIssue[] {
  const issues: AiPluginManifestValidationIssue[] = [];
  const modelKeys = new Set<string>();
  const routeKeys = new Set<string>();

  if (!manifest.packageKey.trim()) {
    issues.push({ code: "PACKAGE_KEY_REQUIRED", message: "packageKey is required" });
  }
  if (!manifest.provider.key.trim()) {
    issues.push({ code: "PROVIDER_KEY_REQUIRED", message: "provider.key is required" });
  }
  if (!manifest.provider.kind.trim()) {
    issues.push({ code: "PROVIDER_KIND_REQUIRED", message: "provider.kind is required" });
  }
  if (!manifest.models.length) {
    issues.push({ code: "MODELS_REQUIRED", message: "At least one model is required" });
  }
  if (!manifest.routes.length) {
    issues.push({ code: "ROUTES_REQUIRED", message: "At least one route is required" });
  }

  for (const model of manifest.models) {
    if (model.modality !== manifest.modality) {
      issues.push({
        code: "MODEL_MODALITY_MISMATCH",
        message: `Model ${model.modelKey} modality must match package modality`,
      });
    }
    if (modelKeys.has(model.modelKey)) {
      issues.push({
        code: "DUPLICATE_MODEL_KEY",
        message: `Duplicate model key: ${model.modelKey}`,
      });
    }
    modelKeys.add(model.modelKey);
  }

  for (const route of manifest.routes) {
    if (route.modality !== manifest.modality) {
      issues.push({
        code: "ROUTE_MODALITY_MISMATCH",
        message: `Route ${route.routeKey} modality must match package modality`,
      });
    }
    if (!modelKeys.has(route.modelKey)) {
      issues.push({
        code: "ROUTE_MODEL_NOT_FOUND",
        message: `Route ${route.routeKey} references missing model ${route.modelKey}`,
      });
    }
    if (routeKeys.has(route.routeKey)) {
      issues.push({
        code: "DUPLICATE_ROUTE_KEY",
        message: `Duplicate route key: ${route.routeKey}`,
      });
    }
    routeKeys.add(route.routeKey);
  }

  for (const model of manifest.models) {
    if (!routeKeys.has(model.defaultRouteKey)) {
      issues.push({
        code: "MODEL_DEFAULT_ROUTE_NOT_FOUND",
        message: `Model ${model.modelKey} references missing default route ${model.defaultRouteKey}`,
      });
    }
  }

  for (const pricing of manifest.pricing) {
    if (pricing.provider !== manifest.provider.key) {
      issues.push({
        code: "PRICING_PROVIDER_MISMATCH",
        message: `Pricing for ${pricing.route} must use provider ${manifest.provider.key}`,
      });
    }
    if (!modelKeys.has(pricing.model)) {
      issues.push({
        code: "PRICING_MODEL_NOT_FOUND",
        message: `Pricing references missing model ${pricing.model}`,
      });
    }
    if (!routeKeys.has(pricing.route)) {
      issues.push({
        code: "PRICING_ROUTE_NOT_FOUND",
        message: `Pricing references missing route ${pricing.route}`,
      });
    }
    if (pricing.minChargeCredits < 1 || pricing.unitCredits < 1) {
      issues.push({
        code: "PRICING_CREDITS_INVALID",
        message: `Pricing for ${pricing.route} must use positive credits`,
      });
    }
  }

  for (const test of manifest.tests) {
    if (!routeKeys.has(test.routeKey)) {
      issues.push({
        code: "TEST_ROUTE_NOT_FOUND",
        message: `Test ${test.key} references missing route ${test.routeKey}`,
      });
    }
  }

  return issues;
}
