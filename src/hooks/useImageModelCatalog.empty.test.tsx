import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useImageModelCatalog } from "./useImageModelCatalog";

const ensureImageModelCatalogLoadedMock = vi.fn();
const getImageModelCatalogSnapshotMock = vi.fn();
const subscribeImageModelCatalogMock = vi.fn();
const listAiModelCatalogMock = vi.fn();

vi.mock("../config/imageModels", () => ({
  ensureImageModelCatalogLoaded: () => ensureImageModelCatalogLoadedMock(),
  getImageModelCatalogSnapshot: () => getImageModelCatalogSnapshotMock(),
  subscribeImageModelCatalog: (listener: () => void) => subscribeImageModelCatalogMock(listener),
}));

vi.mock("../services/v2AiModelCatalogApi", () => ({
  listAiModelCatalog: (...args: unknown[]) => listAiModelCatalogMock(...args),
}));

describe("useImageModelCatalog empty v2 catalog", () => {
  beforeEach(() => {
    ensureImageModelCatalogLoadedMock.mockResolvedValue(undefined);
    getImageModelCatalogSnapshotMock.mockReturnValue({
      defaultModelId: "legacy-model",
      models: [{ id: "legacy-model", isActive: true, label: "Legacy model", sizeOptions: ["1k"] }],
    });
    subscribeImageModelCatalogMock.mockImplementation(() => () => undefined);
    listAiModelCatalogMock.mockResolvedValue([]);
  });

  test("keeps image options empty when the active server catalog is empty", async () => {
    const { result } = renderHook(() => useImageModelCatalog());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.models).toEqual([]);
  });
});
