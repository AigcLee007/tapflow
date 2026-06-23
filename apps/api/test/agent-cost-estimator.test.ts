import { describe, expect, it, vi } from "vitest";

import {
  AgentCostEstimator,
  AgentCostEstimatorError,
} from "../src/modules/agent/agent-cost-estimator.js";

const activeRoute = {
  modelDisplayName: "Nano Banana Pro",
  modelKey: "gemini-3-pro-image-preview",
  pricingMetadata: { sizeTiers: { "1K": 4, "2K": 4.5, "4K": 5 } },
  providerKey: "pixellelabs",
  routeKey: "image.pixellelabs.nano-banana-pro",
  routeLabel: "Line 1",
  status: "active",
  unit: "image_generation",
  unitCredits: 4,
};

describe("AgentCostEstimator", () => {
  it("uses size tier pricing for a single image generation", async () => {
    const estimator = new AgentCostEstimator({
      findImageRoutePricing: vi.fn().mockResolvedValue(activeRoute),
    });

    await expect(estimator.estimateGenerateImage({
      modelDisplayName: "Nano Banana Pro",
      routeLabel: "Line 1",
      size: "4K",
      tenantId: "tenant-1",
    })).resolves.toEqual({
      items: [
        {
          credits: 5,
          label: "Nano Banana Pro Line 1 4K",
          quantity: 1,
        },
      ],
      route: expect.objectContaining({
        modelKey: "gemini-3-pro-image-preview",
        routeKey: "image.pixellelabs.nano-banana-pro",
      }),
      totalCredits: 5,
      unit: "image_generation",
    });
  });

  it("sums batch image generation estimates", async () => {
    const estimator = new AgentCostEstimator({
      findImageRoutePricing: vi.fn().mockResolvedValue(activeRoute),
    });

    const estimate = await estimator.estimateGenerateImageBatch({
      images: [
        { prompt: "one", size: "1K" },
        { prompt: "two", size: "2K" },
        { prompt: "three", size: "4K" },
      ],
      modelDisplayName: "Nano Banana Pro",
      routeLabel: "Line 1",
      tenantId: "tenant-1",
    });

    expect(estimate.totalCredits).toBe(13.5);
    expect(estimate.items).toEqual([
      { credits: 4, label: "Nano Banana Pro Line 1 1K", quantity: 1 },
      { credits: 4.5, label: "Nano Banana Pro Line 1 2K", quantity: 1 },
      { credits: 5, label: "Nano Banana Pro Line 1 4K", quantity: 1 },
    ]);
  });

  it("fails closed when pricing is missing", async () => {
    const estimator = new AgentCostEstimator({
      findImageRoutePricing: vi.fn().mockResolvedValue(null),
    });

    await expect(estimator.estimateGenerateImage({
      routeKey: "image.missing",
      tenantId: "tenant-1",
    })).rejects.toMatchObject({
      code: "PRICING_NOT_FOUND",
    });
  });

  it("rejects inactive routes", async () => {
    const estimator = new AgentCostEstimator({
      findImageRoutePricing: vi.fn().mockResolvedValue({ ...activeRoute, status: "inactive" }),
    });

    await expect(estimator.estimateGenerateImage({
      routeKey: "image.inactive",
      tenantId: "tenant-1",
    })).rejects.toBeInstanceOf(AgentCostEstimatorError);
  });
});
