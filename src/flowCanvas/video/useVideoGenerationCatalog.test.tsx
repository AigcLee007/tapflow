import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  __resetVideoGenerationCatalogCacheForTests,
  useVideoGenerationCatalog,
} from "./useVideoGenerationCatalog";

const listAiModelCatalogMock = vi.fn();
const listAiModelRoutesMock = vi.fn();

vi.mock("../../services/v2AiModelCatalogApi", () => ({
  listAiModelCatalog: (...args: unknown[]) => listAiModelCatalogMock(...args),
  listAiModelRoutes: (...args: unknown[]) => listAiModelRoutesMock(...args),
}));

const model = {
  capabilities: {},
  defaultRouteKey: "private-default-route",
  displayName: "Catalog video",
  id: "catalog-video-1",
  modality: "video" as const,
  modelFamily: "private-family",
  modelId: "private-model",
  modelKey: "video.catalog-video",
  sortOrder: 10,
  status: "active",
  uiSchema: {},
};

const generationRoute = {
  capabilities: { supportedVideoWorkflows: ["video_generation"] },
  estimatedCredits: 5,
  minChargeCredits: 5,
  modality: "video",
  modelFamily: "private-family",
  modelKey: "video.catalog-video",
  pricingUnit: "video_generation",
  providerKey: "private-provider",
  providerName: "Private provider",
  routeId: "route-id",
  routeKey: "private-route",
  routeLabel: "Private route",
};

describe("useVideoGenerationCatalog", () => {
  afterEach(() => {
    __resetVideoGenerationCatalogCacheForTests();
    listAiModelCatalogMock.mockReset();
    listAiModelRoutesMock.mockReset();
  });

  test("shares one video catalog request and exposes mapped models", async () => {
    listAiModelCatalogMock.mockResolvedValue([model]);
    listAiModelRoutesMock.mockResolvedValue([generationRoute]);

    const first = renderHook(() => useVideoGenerationCatalog());
    const second = renderHook(() => useVideoGenerationCatalog());

    await waitFor(() => expect(first.result.current.loading).toBe(false));

    expect(second.result.current.models.map((item) => item.label)).toEqual(["Catalog video"]);
    expect(listAiModelCatalogMock).toHaveBeenCalledTimes(1);
    expect(listAiModelCatalogMock).toHaveBeenCalledWith("video");
    expect(listAiModelRoutesMock).toHaveBeenCalledTimes(1);
  });

  test("does not inject mock entries after a failed request and can retry", async () => {
    listAiModelCatalogMock.mockRejectedValueOnce(new Error("catalog unavailable"));
    const hook = renderHook(() => useVideoGenerationCatalog());

    await waitFor(() => expect(hook.result.current.error).toBe("catalog unavailable"));
    expect(hook.result.current.models).toEqual([]);

    listAiModelCatalogMock.mockResolvedValueOnce([model]);
    listAiModelRoutesMock.mockResolvedValueOnce([generationRoute]);
    hook.result.current.retry();

    await waitFor(() => expect(hook.result.current.models.map((item) => item.id)).toEqual(["catalog-video-1"]));
    expect(hook.result.current.error).toBeNull();
  });
});
