import type {
  AiModelConfigurationModality,
  AiModelConfigurationPricingUnit,
  ModelConfigurationCustomDefinition,
  ModelConfigurationDraftResult,
  SaveModelConfigurationDraftInput,
} from "../../services/v2AiModelConfigurationsApi";

export const WIZARD_STEPS = ["model", "connection", "routeCredential", "pricing", "testPublish"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export type CredentialWizardState =
  | { mode: "create"; name: string; secret: string }
  | { credentialId: string; mode: "existing" }
  | { mode: "unconfirmed" };

export type ConnectionWizardState =
  | { baseUrl: string; environment: string; mode: "create"; name: string }
  | { connectionId: string; mode: "existing" };

export type BuiltinModelSourceState = {
  displayName: string;
  modality: AiModelConfigurationModality;
  modelFamily: string;
  modelKey: string;
  packageKey: string;
  provider?: { key: string; kind: string; name: string };
  type: "builtin";
};

export type ModelSourceState =
  | { type: "unselected" }
  | BuiltinModelSourceState
  | { custom: ModelConfigurationCustomDefinition; type: "custom" };

export type RouteWizardState = {
  apiMode?: string;
  fallbackGroup?: string;
  priority?: number;
  requestConfig?: Record<string, unknown>;
  requestPath?: string;
  routeId?: string;
  routeKey?: string;
  routeLabel: string;
  timeoutMs?: number;
  upstreamModel: string;
  weight?: number;
};

export type PricingWizardState = {
  minChargeCredits: number | null;
  unit?: AiModelConfigurationPricingUnit;
  unitCredits: number | null;
};

export type ModelConfigurationWizardState = {
  connection: ConnectionWizardState;
  credential: CredentialWizardState;
  expectedRevision?: number;
  modelSource: ModelSourceState;
  pricing: PricingWizardState;
  route: RouteWizardState;
  saved?: ModelConfigurationDraftResult;
};

export type BuiltinWizardModel = Omit<BuiltinModelSourceState, "type">;

export type BackupRouteWizardInput = {
  connection: { baseUrl: string | null; environment: string; id: string; name: string };
  credential?: { id: string; name: string; status: string } | null;
  custom?: ModelConfigurationCustomDefinition;
  model: {
    displayName: string;
    modality: AiModelConfigurationModality;
    modelFamily: string;
    modelKey: string;
  };
  packageKey?: string;
  pricing: { minChargeCredits: number; unit: AiModelConfigurationPricingUnit; unitCredits: number };
  provider: { key: string; kind: string; name: string };
  route: {
    apiMode?: string | null;
    configurationRevision: number;
    id: string;
    key: string;
    requestConfig?: Record<string, unknown>;
    requestPath?: string | null;
    routeLabel?: string | null;
    timeoutMs?: number | null;
    upstreamModel?: string | null;
  };
};

export type WizardValidation = { errors: string[]; valid: boolean };

export function pricingUnitForModality(modality: AiModelConfigurationModality): AiModelConfigurationPricingUnit {
  return `${modality}_generation` as AiModelConfigurationPricingUnit;
}

export function initialWizardState(): ModelConfigurationWizardState {
  return {
    connection: { baseUrl: "", environment: "production", mode: "create", name: "" },
    credential: { mode: "unconfirmed" },
    modelSource: { type: "unselected" },
    pricing: { minChargeCredits: null, unitCredits: null },
    route: { routeLabel: "", upstreamModel: "" },
  };
}

export function createBuiltinWizardState(model: BuiltinWizardModel): ModelConfigurationWizardState {
  return {
    ...initialWizardState(),
    modelSource: { ...model, type: "builtin" },
    pricing: { minChargeCredits: null, unit: pricingUnitForModality(model.modality), unitCredits: null },
    route: { routeLabel: "", upstreamModel: model.modelKey },
  };
}

export function createCustomWizardState(custom: ModelConfigurationCustomDefinition): ModelConfigurationWizardState {
  return {
    ...initialWizardState(),
    modelSource: { custom: cloneSerializable(custom), type: "custom" },
    pricing: { minChargeCredits: null, unit: pricingUnitForModality(custom.model.modality), unitCredits: null },
    route: { routeLabel: "", upstreamModel: custom.model.modelKey },
  };
}

export function createBackupRouteWizardState(existingRoute: BackupRouteWizardInput): ModelConfigurationWizardState {
  const modelSource: ModelSourceState = existingRoute.packageKey
    ? {
        displayName: existingRoute.model.displayName,
        modality: existingRoute.model.modality,
        modelFamily: existingRoute.model.modelFamily,
        modelKey: existingRoute.model.modelKey,
        packageKey: existingRoute.packageKey,
        provider: existingRoute.provider,
        type: "builtin",
      }
    : {
        custom: cloneSerializable(existingRoute.custom ?? {
          model: existingRoute.model,
          provider: {
            key: existingRoute.provider.key,
            kind: "openai-compatible",
            name: existingRoute.provider.name,
          },
          routeDefaults: {},
        }),
        type: "custom",
      };

  return {
    connection: { connectionId: existingRoute.connection.id, mode: "existing" },
    credential: { mode: "unconfirmed" },
    modelSource,
    pricing: {
      minChargeCredits: existingRoute.pricing.minChargeCredits,
      unit: pricingUnitForModality(existingRoute.model.modality),
      unitCredits: existingRoute.pricing.unitCredits,
    },
    route: {
      ...(nonEmpty(existingRoute.route.apiMode) ? { apiMode: existingRoute.route.apiMode.trim() } : {}),
      ...(nonEmptyRecord(existingRoute.route.requestConfig) ? { requestConfig: cloneSerializable(existingRoute.route.requestConfig) } : {}),
      ...(nonEmpty(existingRoute.route.requestPath) ? { requestPath: existingRoute.route.requestPath.trim() } : {}),
      routeKey: "",
      routeLabel: existingRoute.route.routeLabel?.trim() || "",
      timeoutMs: existingRoute.route.timeoutMs ?? undefined,
      upstreamModel: existingRoute.route.upstreamModel?.trim() || existingRoute.model.modelKey,
    },
  };
}

export function validateWizardStep(step: WizardStep, state: ModelConfigurationWizardState): WizardValidation {
  const errors: string[] = [];
  const checkModel = () => {
    if (state.modelSource.type === "unselected") {
      errors.push("model");
    } else if (state.modelSource.type === "builtin" && !state.modelSource.packageKey.trim()) {
      errors.push("model.packageKey");
    } else if (state.modelSource.type === "custom") {
      const { model, provider } = state.modelSource.custom;
      if (!isNonEmptyWithin(provider.key, 100)) errors.push("custom.provider.key");
      if (!isNonEmptyWithin(provider.name, 255)) errors.push("custom.provider.name");
      if (provider.kind !== "openai-compatible") errors.push("custom.provider.kind");
      if (provider.defaultBaseUrl !== undefined && !isValidConnectionBaseUrl(provider.defaultBaseUrl)) {
        errors.push("custom.provider.defaultBaseUrl");
      }
      if (!isNonEmptyWithin(model.displayName, 255)) errors.push("custom.model.displayName");
      if (!isNonEmptyWithin(model.modelKey, 255)) errors.push("custom.model.modelKey");
      if (!isNonEmptyWithin(model.modelFamily, 255)) errors.push("custom.model.modelFamily");
      if (!["text", "image", "video"].includes(model.modality)) errors.push("custom.model.modality");
      checkCustomRouteDefaults(state.modelSource.custom.routeDefaults, errors);
    }
  };
  const checkConnection = () => {
    if (state.connection.mode === "create") {
      if (!state.connection.name.trim()) errors.push("connection.name");
      if (!isValidConnectionBaseUrl(state.connection.baseUrl)) errors.push("connection.baseUrl");
      if (!state.connection.environment.trim()) errors.push("connection.environment");
    } else if (!state.connection.connectionId.trim()) {
      errors.push("connection.connectionId");
    }
  };
  const checkRouteCredential = () => {
    if (!state.route.routeLabel.trim()) errors.push("route.routeLabel");
    if (!state.route.upstreamModel.trim()) errors.push("route.upstreamModel");
    if (state.credential.mode === "unconfirmed") {
      errors.push("credential");
    } else if (state.credential.mode === "create") {
      if (!state.credential.name.trim()) errors.push("credential.name");
      if (!state.credential.secret.trim()) errors.push("credential.secret");
    } else if (!state.credential.credentialId.trim()) {
      errors.push("credential.credentialId");
    }
    checkAdvancedRouteFields(state.route, errors);
  };
  const checkPricing = () => {
    if (!isPricingCredit(state.pricing.unitCredits)) errors.push("pricing.unitCredits");
    if (!isPricingCredit(state.pricing.minChargeCredits)) errors.push("pricing.minChargeCredits");
  };
  const checkEditPair = () => {
    const hasRouteId = state.route.routeId !== undefined;
    const hasExpectedRevision = state.expectedRevision !== undefined;
    if (hasRouteId !== hasExpectedRevision) {
      errors.push(hasRouteId ? "route.routeId" : "expectedRevision");
    }
    if (hasExpectedRevision && (!Number.isSafeInteger(state.expectedRevision) || state.expectedRevision <= 0)) {
      errors.push("expectedRevision");
    }
  };

  switch (step) {
    case "model":
      checkModel();
      break;
    case "connection":
      checkConnection();
      break;
    case "routeCredential":
      checkRouteCredential();
      break;
    case "pricing":
      checkPricing();
      break;
    case "testPublish":
      checkModel();
      checkConnection();
      checkRouteCredential();
      checkPricing();
      checkEditPair();
      break;
  }
  return { errors, valid: errors.length === 0 };
}

export function buildDraftPayload(state: ModelConfigurationWizardState): SaveModelConfigurationDraftInput | null {
  if (!validateWizardStep("testPublish", state).valid || state.modelSource.type === "unselected") {
    return null;
  }

  const route = {
    routeLabel: state.route.routeLabel.trim(),
    upstreamModel: state.route.upstreamModel.trim(),
    ...optionalRouteFields(state.route),
  };
  const pricing = {
    minChargeCredits: state.pricing.minChargeCredits!,
    unit: state.pricing.unit ?? pricingUnitForModality(modelModality(state.modelSource)),
    unitCredits: state.pricing.unitCredits!,
  };
  const common = {
    connection: state.connection.mode === "create"
      ? { ...state.connection, baseUrl: state.connection.baseUrl.trim(), name: state.connection.name.trim() }
      : state.connection,
    credential: state.credential.mode === "create"
      ? { ...state.credential, name: state.credential.name.trim(), secret: state.credential.secret.trim() }
      : state.credential,
    ...(state.route.routeId !== undefined && state.expectedRevision !== undefined
      ? { expectedRevision: state.expectedRevision, routeId: state.route.routeId }
      : {}),
    pricing,
    route,
  };
  if (state.modelSource.type === "builtin") {
    return { ...common, packageKey: state.modelSource.packageKey.trim() };
  }
  return { ...common, custom: sanitizedCustomDefinition(state.modelSource.custom) };
}

export function applySavedDraft(
  state: ModelConfigurationWizardState,
  saved: ModelConfigurationDraftResult,
): ModelConfigurationWizardState {
  return {
    ...state,
    connection: { connectionId: saved.connection.id, mode: "existing" },
    credential: { credentialId: saved.credential.id, mode: "existing" },
    expectedRevision: saved.route.configurationRevision,
    pricing: {
      minChargeCredits: saved.pricing.minChargeCredits,
      unit: saved.pricing.unit,
      unitCredits: saved.pricing.unitCredits,
    },
    route: { ...state.route, routeId: saved.route.id, routeKey: saved.route.key },
    saved,
  };
}

function optionalRouteFields(route: RouteWizardState): Omit<RouteWizardState, "routeId" | "routeLabel" | "upstreamModel"> {
  return {
    ...(nonEmpty(route.apiMode) ? { apiMode: route.apiMode!.trim() } : {}),
    ...(nonEmpty(route.fallbackGroup) ? { fallbackGroup: route.fallbackGroup!.trim() } : {}),
    ...(route.priority !== undefined ? { priority: route.priority } : {}),
    ...(nonEmptyRecord(route.requestConfig) ? { requestConfig: route.requestConfig } : {}),
    ...(nonEmpty(route.requestPath) ? { requestPath: route.requestPath!.trim() } : {}),
    ...(nonEmpty(route.routeKey) ? { routeKey: route.routeKey!.trim() } : {}),
    ...(route.timeoutMs !== undefined ? { timeoutMs: route.timeoutMs } : {}),
    ...(route.weight !== undefined ? { weight: route.weight } : {}),
  };
}

function sanitizedCustomDefinition(custom: ModelConfigurationCustomDefinition): ModelConfigurationCustomDefinition {
  const defaults = custom.routeDefaults;
  return {
    model: { ...custom.model },
    provider: {
      key: custom.provider.key.trim(),
      kind: "openai-compatible",
      name: custom.provider.name.trim(),
      ...(nonEmpty(custom.provider.defaultBaseUrl) ? { defaultBaseUrl: custom.provider.defaultBaseUrl!.trim() } : {}),
    },
    routeDefaults: {
      ...(nonEmpty(defaults.apiMode) ? { apiMode: defaults.apiMode!.trim() } : {}),
      ...(defaults.mode ? { mode: defaults.mode } : {}),
      ...(nonEmptyRecord(defaults.requestConfig) ? { requestConfig: defaults.requestConfig } : {}),
      ...(nonEmpty(defaults.requestPath) ? { requestPath: defaults.requestPath!.trim() } : {}),
      ...(defaults.timeoutMs !== undefined ? { timeoutMs: defaults.timeoutMs } : {}),
    },
  };
}

function modelModality(source: Exclude<ModelSourceState, { type: "unselected" }>): AiModelConfigurationModality {
  return source.type === "builtin" ? source.modality : source.custom.model.modality;
}

function isPricingCredit(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.0001 && value <= 1_000_000_000;
}

function nonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyRecord(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return Boolean(value && Object.keys(value).length > 0);
}

function isValidConnectionBaseUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "http:" || url.protocol === "https:")
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

function isNonEmptyWithin(value: string, maxLength: number): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength;
}

function checkAdvancedRouteFields(route: RouteWizardState, errors: string[]) {
  if (nonEmpty(route.routeKey) && !/^[a-z0-9](?:[a-z0-9._-]{0,253}[a-z0-9])?$/i.test(route.routeKey.trim())) {
    errors.push("route.routeKey");
  }
  if (route.priority !== undefined && (!Number.isSafeInteger(route.priority) || route.priority < 0)) {
    errors.push("route.priority");
  }
  if (route.weight !== undefined && (!Number.isSafeInteger(route.weight) || route.weight < 0)) {
    errors.push("route.weight");
  }
  if (route.timeoutMs !== undefined && (!Number.isSafeInteger(route.timeoutMs) || route.timeoutMs <= 0)) {
    errors.push("route.timeoutMs");
  }
}

function checkCustomRouteDefaults(
  defaults: ModelConfigurationCustomDefinition["routeDefaults"],
  errors: string[],
) {
  if (defaults.apiMode !== undefined && !isNonEmptyWithin(defaults.apiMode, 100)) {
    errors.push("custom.routeDefaults.apiMode");
  }
  if (defaults.requestPath !== undefined && !isNonEmptyWithin(defaults.requestPath, 255)) {
    errors.push("custom.routeDefaults.requestPath");
  }
  if (defaults.timeoutMs !== undefined && (!Number.isSafeInteger(defaults.timeoutMs) || defaults.timeoutMs <= 0)) {
    errors.push("custom.routeDefaults.timeoutMs");
  }
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
