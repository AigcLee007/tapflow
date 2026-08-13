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

export type AiPluginCredentialBindingManifest = {
  bindingKey: string;
  label: string;
  modelKey: string;
  routeKey: string;
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

import type { VideoGenerationCapabilities } from "../video-generation-contract.js";
import type { VideoGenerationRequest } from "../types.js";

export type AiPluginModelManifest = {
  capabilities: Partial<VideoGenerationCapabilities> & {
    maxInputImages?: number;
    maxPromptLength?: number | null;
    supportedAspectRatios?: string[];
    supportedGenerationModes?: string[];
    supportedSizes?: string[];
    supportsImageEdit?: boolean;
    supportsImageInput?: boolean;
    supportsReferenceImages?: boolean;
    supportsStreaming?: boolean;
    maxImages?: number;
    supportedImageMimeTypes?: string[];
  };
  defaultRouteKey: string;
  displayName: string;
  modality: AiPluginModality;
  modelFamily: string;
  modelKey: string;
  publishToCatalog?: boolean;
  sortOrder?: number;
  uiSchema: {
    creatorLabel?: string;
    fields: AiPluginUiField[];
    logoKey?: string;
    manufacturer?: string;
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
    params?: VideoGenerationRequest["params"];
    prompt?: string;
  };
  routeKey: string;
};

export type AiPluginManifest = {
  credentialBindings?: AiPluginCredentialBindingManifest[];
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

  const credentialBindingKeys = new Set<string>();
  const credentialBindingLabels = new Set<string>();
  const credentialBindingRoutes = new Set<string>();
  for (const binding of manifest.credentialBindings ?? []) {
    if (!binding.bindingKey.trim()) {
      issues.push({ code: "CREDENTIAL_BINDING_KEY_REQUIRED", message: "Credential binding key is required" });
    }
    if (credentialBindingKeys.has(binding.bindingKey)) {
      issues.push({
        code: "DUPLICATE_CREDENTIAL_BINDING_KEY",
        message: `Duplicate credential binding key: ${binding.bindingKey}`,
      });
    }
    credentialBindingKeys.add(binding.bindingKey);
    if (!binding.label.trim()) {
      issues.push({ code: "CREDENTIAL_BINDING_LABEL_REQUIRED", message: `Credential binding ${binding.bindingKey} label is required` });
    }
    if (credentialBindingLabels.has(binding.label.trim())) {
      issues.push({ code: "DUPLICATE_CREDENTIAL_BINDING_LABEL", message: `Duplicate credential binding label: ${binding.label}` });
    }
    credentialBindingLabels.add(binding.label.trim());
    if (credentialBindingRoutes.has(binding.routeKey)) {
      issues.push({ code: "DUPLICATE_CREDENTIAL_BINDING_ROUTE", message: `Duplicate credential binding route: ${binding.routeKey}` });
    }
    credentialBindingRoutes.add(binding.routeKey);
    if (!modelKeys.has(binding.modelKey)) {
      issues.push({
        code: "CREDENTIAL_BINDING_MODEL_NOT_FOUND",
        message: `Credential binding ${binding.bindingKey} references missing model ${binding.modelKey}`,
      });
    }
    const route = manifest.routes.find((item) => item.routeKey === binding.routeKey);
    if (!route) {
      issues.push({
        code: "CREDENTIAL_BINDING_ROUTE_NOT_FOUND",
        message: `Credential binding ${binding.bindingKey} references missing route ${binding.routeKey}`,
      });
    } else if (route.modelKey !== binding.modelKey) {
      issues.push({
        code: "CREDENTIAL_BINDING_ROUTE_MODEL_MISMATCH",
        message: `Credential binding ${binding.bindingKey} must reference a route for model ${binding.modelKey}`,
      });
    }
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

  if (manifest.credentialBindings?.length) {
    for (const route of manifest.routes) {
      if (!credentialBindingRoutes.has(route.routeKey)) {
        issues.push({
          code: "CREDENTIAL_BINDING_ROUTE_COVERAGE_INCOMPLETE",
          message: `Route ${route.routeKey} has no credential binding`,
        });
      }
    }
    if (credentialBindingRoutes.size !== manifest.routes.length) {
      issues.push({
        code: "CREDENTIAL_BINDING_ROUTE_COVERAGE_INCOMPLETE",
        message: "Every route must have exactly one credential binding",
      });
    }
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
    if (
      !Number.isFinite(pricing.minChargeCredits) ||
      pricing.minChargeCredits <= 0 ||
      !Number.isFinite(pricing.unitCredits) ||
      pricing.unitCredits <= 0
    ) {
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
