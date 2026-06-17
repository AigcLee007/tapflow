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

describe("useImageModelCatalog", () => {
  beforeEach(() => {
    ensureImageModelCatalogLoadedMock.mockReset();
    getImageModelCatalogSnapshotMock.mockReset();
    subscribeImageModelCatalogMock.mockReset();
    listAiModelCatalogMock.mockReset();

    ensureImageModelCatalogLoadedMock.mockResolvedValue(undefined);
    subscribeImageModelCatalogMock.mockImplementation(() => () => undefined);
    getImageModelCatalogSnapshotMock.mockReturnValue({
      defaultModelId: "jimeng-5.0",
      models: [
        {
          defaultSize: "1k",
          id: "jimeng-5.0",
          isActive: true,
          label: "即梦5.0",
          modelFamily: "jimeng-5.0",
          routeFamily: "jimeng-5.0",
          sizeOptions: ["1k"],
        },
      ],
    });
  });

  test("prefers the v2 image model catalog so workbench and canvas stay aligned", async () => {
    listAiModelCatalogMock.mockResolvedValue([
      {
        capabilities: {},
        defaultRouteKey: "image.pixellelabs.nano-banana-pro",
        displayName: "Nano Banana Pro",
        id: "catalog-1",
        modality: "image",
        modelFamily: "pixellelabs.nano-banana-pro",
        modelId: null,
        modelKey: "pixellelabs.nano-banana-pro",
        sortOrder: 10,
        status: "active",
        uiSchema: {
          fields: [
            {
              key: "imageSize",
              options: [{ value: "1k" }, { value: "2k" }, { value: "4k" }],
              type: "select",
            },
          ],
        },
      },
      {
        capabilities: {},
        defaultRouteKey: "image.pixellelabs.nano-banana-2",
        displayName: "Nano Banana 2",
        id: "catalog-2",
        modality: "image",
        modelFamily: "pixellelabs.nano-banana-2",
        modelId: null,
        modelKey: "pixellelabs.nano-banana-2",
        sortOrder: 20,
        status: "active",
        uiSchema: {
          fields: [
            {
              key: "imageSize",
              options: [{ value: "1k" }, { value: "2k" }, { value: "4k" }],
              type: "select",
            },
          ],
        },
      },
      {
        capabilities: {},
        defaultRouteKey: "image.gpt-image-2",
        displayName: "GPT-Image-2",
        id: "catalog-3",
        modality: "image",
        modelFamily: "gpt-image-2",
        modelId: null,
        modelKey: "gpt-image-2",
        sortOrder: 30,
        status: "active",
        uiSchema: {
          fields: [
            {
              key: "size",
              options: [{ value: "auto" }, { value: "1k" }, { value: "2k" }, { value: "4k" }],
              type: "select",
            },
          ],
        },
      },
    ]);

    const { result } = renderHook(() => useImageModelCatalog());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(listAiModelCatalogMock).toHaveBeenCalledWith("image");
    expect(result.current.models.map((item) => item.label)).toEqual([
      "Nano Banana Pro",
      "Nano Banana 2",
      "GPT-Image-2",
    ]);
  });
});
