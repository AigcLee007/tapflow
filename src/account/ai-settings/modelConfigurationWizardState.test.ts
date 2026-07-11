import { describe, expect, test } from "vitest";

import {
  applySavedDraft,
  buildDraftPayload,
  createBackupRouteWizardState,
  createBuiltinWizardState,
  createCustomWizardState,
  initialWizardState,
  pricingUnitForModality,
  validateWizardStep,
  WIZARD_STEPS,
} from "./modelConfigurationWizardState";
import type { ModelConfigurationCustomDefinition } from "../../services/v2AiModelConfigurationsApi";

const id = "11111111-1111-4111-8111-111111111111";

function validBuiltinState() {
  return {
    ...createBuiltinWizardState({
      displayName: "Example Image",
      modality: "image",
      modelFamily: "example",
      modelKey: "example-image",
      packageKey: "example.image",
    }),
    connection: { baseUrl: "https://api.example.com", environment: "production", mode: "create" as const, name: "Example" },
    credential: { mode: "create" as const, name: "Example credential", secret: "secret-value" },
    pricing: { minChargeCredits: 1, unitCredits: 2 },
    route: { routeLabel: "Line 1", upstreamModel: "example-image" },
  };
}

function validCustomState(custom: ModelConfigurationCustomDefinition) {
  return {
    ...createCustomWizardState(custom),
    connection: { baseUrl: "https://custom.example.com", environment: "production", mode: "create" as const, name: "Custom" },
    credential: { credentialId: id, mode: "existing" as const },
    pricing: { minChargeCredits: 3, unitCredits: 4 },
    route: { routeLabel: "Line 1", upstreamModel: "custom-video" },
  };
}

const validCustomDefinition: ModelConfigurationCustomDefinition = {
  model: { displayName: "Custom Video", modality: "video", modelFamily: "custom-video", modelKey: "custom-video" },
  provider: { key: "custom", kind: "openai-compatible", name: "Custom Provider" },
  routeDefaults: {},
};

describe("modelConfigurationWizardState", () => {
  test("defines the five ordered wizard steps", () => {
    expect(WIZARD_STEPS).toEqual(["model", "connection", "routeCredential", "pricing", "testPublish"]);
    expect(initialWizardState().credential).toEqual({ mode: "unconfirmed" });
  });

  test("builds a valid built-in payload without empty advanced fields", () => {
    const state = {
      ...validBuiltinState(),
      route: {
        apiMode: "",
        fallbackGroup: " ",
        priority: undefined,
        requestConfig: {},
        requestPath: "",
        routeKey: "",
        routeLabel: "Line 1",
        timeoutMs: undefined,
        upstreamModel: "example-image",
        weight: undefined,
      },
    };

    expect(buildDraftPayload(state)).toEqual({
      connection: { baseUrl: "https://api.example.com", environment: "production", mode: "create", name: "Example" },
      credential: { mode: "create", name: "Example credential", secret: "secret-value" },
      packageKey: "example.image",
      pricing: { minChargeCredits: 1, unit: "image_generation", unitCredits: 2 },
      route: { routeLabel: "Line 1", upstreamModel: "example-image" },
    });
  });

  test("builds a valid custom payload", () => {
    const state = {
      ...createCustomWizardState({
        model: { displayName: "Custom Video", modality: "video", modelFamily: "custom-video", modelKey: "custom-video" },
        provider: { key: "custom", kind: "openai-compatible", name: "Custom Provider" },
        routeDefaults: {},
      }),
      connection: { baseUrl: "https://custom.example.com", environment: "production", mode: "create" as const, name: "Custom" },
      credential: { credentialId: id, mode: "existing" as const },
      pricing: { minChargeCredits: 3, unitCredits: 4 },
      route: { routeLabel: "Line 1", upstreamModel: "custom-video" },
    };

    expect(buildDraftPayload(state)).toEqual({
      connection: { baseUrl: "https://custom.example.com", environment: "production", mode: "create", name: "Custom" },
      credential: { credentialId: id, mode: "existing" },
      custom: {
        model: { displayName: "Custom Video", modality: "video", modelFamily: "custom-video", modelKey: "custom-video" },
        provider: { key: "custom", kind: "openai-compatible", name: "Custom Provider" },
        routeDefaults: {},
      },
      pricing: { minChargeCredits: 3, unit: "video_generation", unitCredits: 4 },
      route: { routeLabel: "Line 1", upstreamModel: "custom-video" },
    });
  });

  test.each([
    ["model", initialWizardState(), "model"],
    ["model", { ...validBuiltinState(), modelSource: { ...validBuiltinState().modelSource, packageKey: "" } }, "model.packageKey"],
    ["connection", { ...validBuiltinState(), connection: { baseUrl: "", environment: "production", mode: "create" as const, name: "" } }, "connection.name"],
    ["connection", { ...validBuiltinState(), connection: { baseUrl: "https://api.example.com", environment: " ", mode: "create" as const, name: "Example" } }, "connection.environment"],
    ["routeCredential", { ...validBuiltinState(), credential: { mode: "unconfirmed" as const } }, "credential"],
    ["routeCredential", { ...validBuiltinState(), credential: { mode: "create" as const, name: "", secret: "" } }, "credential.name"],
    ["routeCredential", { ...validBuiltinState(), credential: { mode: "create" as const, name: "Credential", secret: "" } }, "credential.secret"],
    ["routeCredential", { ...validBuiltinState(), credential: { mode: "create" as const, name: "", secret: "secret-value" } }, "credential.name"],
    ["routeCredential", { ...validBuiltinState(), credential: { credentialId: "", mode: "existing" as const } }, "credential.credentialId"],
    ["routeCredential", { ...validBuiltinState(), route: { routeLabel: "", upstreamModel: "" } }, "route.routeLabel"],
    ["routeCredential", { ...validBuiltinState(), route: { routeLabel: "Line 1", upstreamModel: "" } }, "route.upstreamModel"],
    ["routeCredential", { ...validBuiltinState(), route: { routeLabel: "", upstreamModel: "example-image" } }, "route.routeLabel"],
    ["pricing", { ...validBuiltinState(), pricing: { minChargeCredits: 0, unitCredits: -1 } }, "pricing.unitCredits"],
    ["pricing", { ...validBuiltinState(), pricing: { minChargeCredits: 0, unitCredits: 1 } }, "pricing.minChargeCredits"],
    ["pricing", { ...validBuiltinState(), pricing: { minChargeCredits: 1, unitCredits: 0 } }, "pricing.unitCredits"],
    ["testPublish", { ...validBuiltinState(), credential: { mode: "unconfirmed" as const } }, "credential"],
  ] as const)("reports %s validation errors", (step, state, error) => {
    expect(validateWizardStep(step, state).errors).toContain(error);
  });

  test("does not require optional advanced route fields", () => {
    expect(validateWizardStep("testPublish", validBuiltinState())).toEqual({ errors: [], valid: true });
  });

  test.each([
    ["connection name", "connection", "connection.name", 255, (value: string) => ({ ...validBuiltinState(), connection: { ...validBuiltinState().connection, name: value } })],
    ["connection environment", "connection", "connection.environment", 64, (value: string) => ({ ...validBuiltinState(), connection: { ...validBuiltinState().connection, environment: value } })],
    ["credential name", "routeCredential", "credential.name", 255, (value: string) => ({ ...validBuiltinState(), credential: { mode: "create" as const, name: value, secret: "secret-value" } })],
    ["credential secret", "routeCredential", "credential.secret", 4000, (value: string) => ({ ...validBuiltinState(), credential: { mode: "create" as const, name: "Example credential", secret: value } })],
    ["route label", "routeCredential", "route.routeLabel", 255, (value: string) => ({ ...validBuiltinState(), route: { ...validBuiltinState().route, routeLabel: value } })],
    ["upstream model", "routeCredential", "route.upstreamModel", 255, (value: string) => ({ ...validBuiltinState(), route: { ...validBuiltinState().route, upstreamModel: value } })],
    ["API mode", "routeCredential", "route.apiMode", 100, (value: string) => ({ ...validBuiltinState(), route: { ...validBuiltinState().route, apiMode: value } })],
    ["request path", "routeCredential", "route.requestPath", 255, (value: string) => ({ ...validBuiltinState(), route: { ...validBuiltinState().route, requestPath: value } })],
    ["fallback group", "routeCredential", "route.fallbackGroup", 255, (value: string) => ({ ...validBuiltinState(), route: { ...validBuiltinState().route, fallbackGroup: value } })],
  ] as const)("enforces the %s maximum length", (_label, step, error, maxLength, stateFor) => {
    expect(validateWizardStep(step, stateFor("x".repeat(maxLength))).errors).not.toContain(error);
    expect(validateWizardStep(step, stateFor("x".repeat(maxLength + 1))).errors).toContain(error);
  });

  test.each([
    [{ ...validBuiltinState(), route: { ...validBuiltinState().route, routeId: id } }, "route.routeId"],
    [{ ...validBuiltinState(), expectedRevision: 1 }, "expectedRevision"],
  ] as const)("rejects unpaired edit state: %s", (state, error) => {
    expect(validateWizardStep("testPublish", state).errors).toContain(error);
    expect(buildDraftPayload(state)).toBeNull();
  });

  test("serializes a paired edit revision without truthiness checks", () => {
    const state = {
      ...validBuiltinState(),
      expectedRevision: 1,
      route: { ...validBuiltinState().route, routeId: id },
    };

    expect(buildDraftPayload(state)).toMatchObject({ expectedRevision: 1, routeId: id });
  });

  test.each([
    [{ routeKey: "-invalid" }, "route.routeKey"],
    [{ routeKey: "x".repeat(256) }, "route.routeKey"],
    [{ priority: -1 }, "route.priority"],
    [{ priority: 1.5 }, "route.priority"],
    [{ weight: -1 }, "route.weight"],
    [{ weight: 1.5 }, "route.weight"],
    [{ timeoutMs: 0 }, "route.timeoutMs"],
    [{ timeoutMs: 1.5 }, "route.timeoutMs"],
    [{ timeoutMs: Number.MAX_SAFE_INTEGER + 1 }, "route.timeoutMs"],
  ])("validates advanced route field %o", (route, error) => {
    const state = { ...validBuiltinState(), route: { ...validBuiltinState().route, ...route } };

    expect(validateWizardStep("testPublish", state).errors).toContain(error);
  });

  test.each([
    [{ minChargeCredits: 0.00001, unitCredits: 1 }, "pricing.minChargeCredits"],
    [{ minChargeCredits: 1_000_000_001, unitCredits: 1 }, "pricing.minChargeCredits"],
    [{ minChargeCredits: 1, unitCredits: 0.00001 }, "pricing.unitCredits"],
    [{ minChargeCredits: 1, unitCredits: 1_000_000_001 }, "pricing.unitCredits"],
  ])("enforces backend pricing bounds", (pricing, error) => {
    const state = { ...validBuiltinState(), pricing };

    expect(validateWizardStep("pricing", state).errors).toContain(error);
  });

  test.each([
    [{ ...validCustomDefinition, provider: { ...validCustomDefinition.provider, defaultBaseUrl: "ftp://custom.example.com" } }, "custom.provider.defaultBaseUrl"],
    [{ ...validCustomDefinition, provider: { ...validCustomDefinition.provider, defaultBaseUrl: "https://user:pass@custom.example.com" } }, "custom.provider.defaultBaseUrl"],
    [{ ...validCustomDefinition, provider: { ...validCustomDefinition.provider, defaultBaseUrl: "https://custom.example.com?token=value" } }, "custom.provider.defaultBaseUrl"],
    [{ ...validCustomDefinition, provider: { ...validCustomDefinition.provider, defaultBaseUrl: "https://custom.example.com#fragment" } }, "custom.provider.defaultBaseUrl"],
    [{ ...validCustomDefinition, provider: { ...validCustomDefinition.provider, kind: "" as "openai-compatible" } }, "custom.provider.kind"],
  ])("validates custom provider advanced fields", (custom, error) => {
    expect(validateWizardStep("model", validCustomState(custom)).errors).toContain(error);
  });

  test("clones custom definition data at initialization", () => {
    const custom: ModelConfigurationCustomDefinition = {
      ...validCustomDefinition,
      routeDefaults: { requestConfig: { nested: { quality: "high" } } },
    };
    const state = createCustomWizardState(custom);
    (custom.routeDefaults.requestConfig!.nested as { quality: string }).quality = "low";

    expect(state.modelSource).toMatchObject({ custom: { routeDefaults: { requestConfig: { nested: { quality: "high" } } } } });
  });

  test.each([
    "not a url",
    "ftp://api.example.com",
    "https://user:password@api.example.com",
    "https://api.example.com/v1?model=example",
    "https://api.example.com/v1#fragment",
  ])("rejects an invalid connection base URL: %s", (baseUrl) => {
    const state = {
      ...validBuiltinState(),
      connection: { baseUrl, environment: "production", mode: "create" as const, name: "Example" },
    };

    expect(validateWizardStep("connection", state).errors).toContain("connection.baseUrl");
  });

  test("requires an existing connection ID", () => {
    const state = {
      ...validBuiltinState(),
      connection: { connectionId: "", mode: "existing" as const },
    };

    expect(validateWizardStep("connection", state).errors).toContain("connection.connectionId");
  });

  test.each([
    [
      { ...validCustomDefinition, provider: { ...validCustomDefinition.provider, key: "" } },
      "custom.provider.key",
    ],
    [
      { ...validCustomDefinition, provider: { ...validCustomDefinition.provider, name: "" } },
      "custom.provider.name",
    ],
    [
      { ...validCustomDefinition, model: { ...validCustomDefinition.model, displayName: "" } },
      "custom.model.displayName",
    ],
    [
      { ...validCustomDefinition, model: { ...validCustomDefinition.model, modelKey: "" } },
      "custom.model.modelKey",
    ],
    [
      { ...validCustomDefinition, model: { ...validCustomDefinition.model, modelFamily: "" } },
      "custom.model.modelFamily",
    ],
  ] as const)("requires %s", (custom, error) => {
    expect(validateWizardStep("model", validCustomState(custom)).errors).toContain(error);
  });

  test("makes backups re-confirm the credential and never reuse the stable route key", () => {
    const requestConfig = { nested: { quality: "high" } };
    const backup = createBackupRouteWizardState({
      connection: { baseUrl: "https://api.example.com", environment: "production", id, name: "Existing connection" },
      credential: { id, name: "Existing credential", status: "active" },
      model: { displayName: "Example Image", modality: "image", modelFamily: "example", modelKey: "example-image" },
      packageKey: "example.image",
      pricing: { minChargeCredits: 1, unit: "image_generation", unitCredits: 2 },
      provider: { key: "example", kind: "openai-compatible", name: "Example" },
      route: {
        apiMode: "sync",
        configurationRevision: 4,
        id,
        key: "example.image.stable",
        requestConfig,
        requestPath: "/v1/images",
        routeLabel: "Original line",
        upstreamModel: "example-image",
      },
    });

    expect(backup.connection).toEqual({ connectionId: id, mode: "existing" });
    expect(backup.credential).toEqual({ mode: "unconfirmed" });
    expect(backup.route).toMatchObject({
      apiMode: "sync",
      requestConfig: { nested: { quality: "high" } },
      requestPath: "/v1/images",
      routeKey: "",
      routeLabel: "Original line",
      upstreamModel: "example-image",
    });
    expect(backup.pricing.unit).toBe("image_generation");
    expect(buildDraftPayload(backup)).toBeNull();
    requestConfig.nested.quality = "low";
    expect(backup.route.requestConfig).toEqual({ nested: { quality: "high" } });
  });

  test("replaces a saved create credential with a sanitized existing selection", () => {
    const state = validBuiltinState();
    const saved = {
      catalog: { id: "catalog-1", status: "inactive" },
      connection: { baseUrl: "https://api.example.com/", environment: "production", id: "connection-1", name: "Example", status: "inactive" },
      credential: { id: "credential-1", name: "Example credential", secretFingerprint: "fingerprint", status: "active" },
      model: { displayName: "Example Image", id: "model-1", modality: "image", modelFamily: "example", modelKey: "example-image" },
      pricing: { active: false, minChargeCredits: 1, unit: "image_generation" as const, unitCredits: 2 },
      route: { configurationRevision: 2, id, key: "example.image", status: "inactive", testedRevision: null },
    };

    const next = applySavedDraft(state, saved);

    expect(next.credential).toEqual({ credentialId: "credential-1", mode: "existing" });
    expect(JSON.stringify(next)).not.toContain("secret-value");
    expect(next.saved).toEqual(saved);
  });

  test("derives pricing units from every supported modality", () => {
    expect(pricingUnitForModality("text")).toBe("text_generation");
    expect(pricingUnitForModality("image")).toBe("image_generation");
    expect(pricingUnitForModality("video")).toBe("video_generation");
  });
});
