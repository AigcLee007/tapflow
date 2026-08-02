import { describe, expect, test } from "vitest";

import type { AiModelCatalogItem, AiModelCatalogRoute } from "../../services/v2AiModelCatalogApi";
import { groupTextModelOptions, toTextModelOptions } from "./textModelCatalog";

const model = (overrides: Partial<AiModelCatalogItem> = {}): AiModelCatalogItem => ({
  capabilities: {},
  defaultRouteKey: "text.real.line-2",
  displayName: "真实文本模型",
  id: "catalog-text-1",
  modality: "text",
  modelFamily: "real-text-family",
  modelId: "model-uuid-1",
  modelKey: "real-text-model",
  sortOrder: 10,
  status: "active",
  uiSchema: {},
  ...overrides,
});

const route = (overrides: Partial<AiModelCatalogRoute> = {}): AiModelCatalogRoute => ({
  capabilities: {},
  estimatedCredits: 3,
  minChargeCredits: 2,
  modality: "text",
  modelFamily: "real-text-family",
  modelKey: "real-text-model",
  pricingUnit: "text_generation",
  providerKey: "real-provider",
  providerName: "Real Provider",
  routeId: "route-uuid-1",
  routeKey: "text.real.line-1",
  routeLabel: "线路一",
  ...overrides,
});

describe("toTextModelOptions", () => {
  test("returns active text models with priced routes and real runtime identifiers", () => {
    const options = toTextModelOptions([
      model(),
      model({ id: "inactive", modelKey: "inactive", status: "inactive" }),
      model({ id: "image", modality: "image", modelKey: "image-model" }),
      model({ id: "unpriced", modelKey: "unpriced" }),
      model({ id: "no-routes", modelKey: "no-routes" }),
    ], {
      "real-text-model": [
        route(),
        route({
          estimatedCredits: null,
          minChargeCredits: 4,
          routeId: "route-uuid-2",
          routeKey: "text.real.line-2",
          routeLabel: "线路二",
        }),
        route({
          estimatedCredits: null,
          minChargeCredits: null,
          routeId: "unpriced-route",
          routeKey: "text.real.unpriced",
        }),
      ],
      unpriced: [route({ estimatedCredits: 0, minChargeCredits: null })],
    });

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      defaultRoute: {
        credits: 4,
        id: "route-uuid-2",
        label: "线路二",
        providerKey: "real-provider",
        routeKey: "text.real.line-2",
      },
      id: "real-text-model",
      label: "真实文本模型",
      modelFamily: "real-text-family",
      modelKey: "real-text-model",
    });
    expect(options[0]?.routes).toEqual([
      expect.objectContaining({ id: "route-uuid-1", label: "线路一", routeKey: "text.real.line-1" }),
      expect.objectContaining({ id: "route-uuid-2", label: "线路二", routeKey: "text.real.line-2" }),
    ]);
  });

  test("sorts models and routes and supplies a creator-safe line label", () => {
    const options = toTextModelOptions([
      model({ displayName: "模型乙", modelKey: "model-b", sortOrder: 20 }),
      model({ defaultRouteKey: null, displayName: "模型甲", modelKey: "model-a", sortOrder: 10 }),
    ], {
      "model-a": [
        route({ modelKey: "model-a", routeId: "route-b", routeKey: "text.a.b", routeLabel: "线路二" }),
        route({ modelKey: "model-a", routeId: "route-a", routeKey: "text.a.a", routeLabel: null }),
      ],
      "model-b": [route({ modelKey: "model-b", routeId: "route-c", routeKey: "text.b" })],
    });

    expect(options.map((item) => item.label)).toEqual(["模型甲", "模型乙"]);
    expect(options[0]?.routes.map((item) => item.label)).toEqual(["默认线路", "线路二"]);
    expect(options[0]?.defaultRoute.id).toBe("route-a");
  });

  test("maps catalog branding and groups active models by manufacturer", () => {
    const options = toTextModelOptions([
      model({
        displayName: "GPT-5.6-sol",
        modelKey: "gpt-5.6-sol",
        sortOrder: 30,
        uiSchema: { logoKey: "openai", manufacturer: "GPT" },
      }),
      model({
        displayName: "Gemini-3.1-pro",
        modelKey: "gemini-3.1-pro",
        sortOrder: 10,
        uiSchema: { logoKey: "google-gemini", manufacturer: "Gemini" },
      }),
      model({
        displayName: "Claude-Opus-5",
        modelKey: "claude-opus-5",
        sortOrder: 40,
        uiSchema: { logoKey: "claude", manufacturer: "Claude" },
      }),
      model({
        displayName: "Independent text model",
        modelKey: "independent-text",
        sortOrder: 50,
        uiSchema: {},
      }),
    ], {
      "gpt-5.6-sol": [route({ modelKey: "gpt-5.6-sol", routeId: "gpt-route", routeKey: "text.gpt" })],
      "gemini-3.1-pro": [route({ modelKey: "gemini-3.1-pro", routeId: "gemini-route", routeKey: "text.gemini" })],
      "claude-opus-5": [route({ modelKey: "claude-opus-5", routeId: "claude-route", routeKey: "text.claude" })],
      "independent-text": [route({ modelKey: "independent-text", routeId: "other-route", routeKey: "text.other" })],
    });

    expect(options[0]).toMatchObject({
      logoKey: "google-gemini",
      manufacturer: "Gemini",
    });
    expect(groupTextModelOptions(options).map((group) => group.manufacturer)).toEqual([
      "Gemini",
      "GPT",
      "Claude",
      "其他",
    ]);
  });
});
