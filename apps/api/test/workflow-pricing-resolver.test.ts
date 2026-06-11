import { describe, expect, it } from "vitest";

import { resolveNodePricing } from "../src/modules/workflow-runs/workflow-runs.service.js";

const pricingRows = [
  {
    min_charge_credits: "19",
    model: "model-a",
    provider: "provider-a",
    route: "image.default",
    unit: "image_generation",
    unit_credits: "19",
  },
  {
    min_charge_credits: "17",
    model: "model-a",
    provider: "provider-a",
    route: "default",
    unit: "image_generation",
    unit_credits: "17",
  },
  {
    min_charge_credits: "13",
    model: "default",
    provider: "provider-a",
    route: "default",
    unit: "image_generation",
    unit_credits: "13",
  },
  {
    min_charge_credits: "10",
    model: "default",
    provider: "default",
    route: "default",
    unit: "image_generation",
    unit_credits: "10",
  },
] as const;

describe("workflow pricing resolver", () => {
  it("matches exact provider/model/route/unit first", () => {
    const resolved = resolveNodePricing({
      configuredRouteKey: "image.default",
      nodeType: "image.generate",
      pricingRows: [...pricingRows],
      routeContext: {
        modelKey: "model-a",
        providerKey: "provider-a",
        routeKey: "image.default",
      },
    });

    expect(resolved.amountCents).toBe(19);
    expect(resolved.fallbackLevel).toBe(1);
    expect(resolved.pricingMatch).toMatchObject({
      model: "model-a",
      provider: "provider-a",
      route: "image.default",
      unit: "image_generation",
    });
  });

  it("falls back in the expected order", () => {
    const level2 = resolveNodePricing({
      configuredRouteKey: "image.other",
      nodeType: "image.generate",
      pricingRows: [...pricingRows],
      routeContext: {
        modelKey: "model-a",
        providerKey: "provider-a",
        routeKey: "image.other",
      },
    });
    expect(level2.amountCents).toBe(17);
    expect(level2.fallbackLevel).toBe(2);

    const level3 = resolveNodePricing({
      configuredRouteKey: "image.other",
      nodeType: "image.generate",
      pricingRows: pricingRows.filter((row) => !(row.provider === "provider-a" && row.model === "model-a")),
      routeContext: {
        modelKey: "model-a",
        providerKey: "provider-a",
        routeKey: "image.other",
      },
    });
    expect(level3.amountCents).toBe(13);
    expect(level3.fallbackLevel).toBe(3);

    const level4 = resolveNodePricing({
      configuredRouteKey: "image.other",
      nodeType: "image.generate",
      pricingRows: pricingRows.filter((row) => !(row.provider === "provider-a")),
      routeContext: {
        modelKey: "model-a",
        providerKey: "provider-a",
        routeKey: "image.other",
      },
    });
    expect(level4.amountCents).toBe(10);
    expect(level4.fallbackLevel).toBe(4);
  });

  it("returns not found semantics when no pricing row exists", () => {
    const resolved = resolveNodePricing({
      configuredRouteKey: "image.default",
      nodeType: "image.generate",
      pricingRows: [],
      routeContext: {
        modelKey: "model-a",
        providerKey: "provider-a",
        routeKey: "image.default",
      },
    });

    expect(resolved.amountCents).toBe(0);
    expect(resolved.fallbackLevel).toBeNull();
    expect(resolved.pricingMatch).toBeNull();
    expect(resolved.unit).toBe("image_generation");
  });

  it("maps default/default/default hit to fallback level 4 when route context is unresolved", () => {
    const resolved = resolveNodePricing({
      configuredRouteKey: null,
      nodeType: "image.generate",
      pricingRows: [
        {
          min_charge_credits: "10",
          model: "default",
          provider: "default",
          route: "default",
          unit: "image_generation",
          unit_credits: "10",
        },
      ],
      routeContext: null,
    });

    expect(resolved.amountCents).toBe(10);
    expect(resolved.fallbackLevel).toBe(4);
    expect(resolved.pricingMatch).toMatchObject({
      model: "default",
      provider: "default",
      route: "default",
      unit: "image_generation",
    });
  });

  it("multiplies image pricing by requested output count", () => {
    const resolved = resolveNodePricing({
      configuredRouteKey: "image.default",
      nodeType: "image.generate",
      pricingRows: [
        {
          min_charge_credits: "24",
          model: "model-a",
          provider: "provider-a",
          route: "image.default",
          unit: "image_generation",
          unit_credits: "24",
        },
      ],
      quantity: 2,
      routeContext: {
        modelKey: "model-a",
        providerKey: "provider-a",
        routeKey: "image.default",
      },
    });

    expect(resolved.amountCents).toBe(48);
  });
});
