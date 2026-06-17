import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AppRouter } from "../app/AppRouter";
import { AuthContext, type AuthState } from "../auth/useAuth";

const useImageModelCatalogMock = vi.fn();
const listAiModelRoutesMock = vi.fn();
const listWorkbenchGenerationsMock = vi.fn();
const createWorkbenchGenerationMock = vi.fn();
const getWorkbenchGenerationMock = vi.fn();
const retryWorkbenchGenerationMock = vi.fn();
const uploadWorkbenchReferenceFileMock = vi.fn();
const getAssetMock = vi.fn();
const getAssetVariantUrlMock = vi.fn();

vi.mock("../auth/AuthGate", () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../hooks/useImageModelCatalog", () => ({
  useImageModelCatalog: () => useImageModelCatalogMock(),
}));

vi.mock("../services/v2AiModelCatalogApi", async () => {
  const actual = await vi.importActual("../services/v2AiModelCatalogApi");
  return {
    ...actual,
    listAiModelRoutes: (...args: unknown[]) => listAiModelRoutesMock(...args),
  };
});

vi.mock("../services/v2WorkbenchApi", async () => {
  const actual = await vi.importActual("../services/v2WorkbenchApi");
  return {
    ...actual,
    createWorkbenchGeneration: (...args: unknown[]) => createWorkbenchGenerationMock(...args),
    getWorkbenchGeneration: (...args: unknown[]) => getWorkbenchGenerationMock(...args),
    listWorkbenchGenerations: (...args: unknown[]) => listWorkbenchGenerationsMock(...args),
    retryWorkbenchGeneration: (...args: unknown[]) => retryWorkbenchGenerationMock(...args),
    uploadWorkbenchReferenceFile: (...args: unknown[]) => uploadWorkbenchReferenceFileMock(...args),
  };
});

vi.mock("../assets/assetApi", async () => {
  const actual = await vi.importActual("../assets/assetApi");
  return {
    ...actual,
    getAsset: (...args: unknown[]) => getAssetMock(...args),
    getAssetVariantUrl: (...args: unknown[]) => getAssetVariantUrlMock(...args),
  };
});

function setRoute(pathname: string) {
  window.history.replaceState(null, "", pathname);
}

function createGeneration(overrides: Record<string, unknown> = {}) {
  return {
    chargedCredits: null,
    createdAt: new Date().toISOString(),
    displayMode: "merged",
    errorJson: null,
    estimatedCredits: 1,
    finishedAt: null,
    id: "generation-1",
    modelId: "pixellelabs.nano-banana-pro",
    params: { aspect_ratio: "1:1", size: "1k" },
    prompt: "Product poster",
    referenceAssetIds: [],
    requestedCount: 1,
    reservedCredits: 1,
    reserveLedgerId: "ledger-1",
    results: [],
    routeKey: "image.pixellelabs.nano-banana-pro",
    sessionId: null,
    startedAt: null,
    status: "queued",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createAuthState(overrides: Partial<AuthState> = {}): AuthState {
  return {
    authenticated: true,
    error: null,
    loading: false,
    permissions: ["flow:run", "run:read", "project:update"],
    refreshMe: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    roles: ["tenant_owner"],
    sessionId: "session-1",
    tenant: {
      id: "tenant-1",
      name: "Test Workspace",
      plan: "free",
      slug: "test",
      status: "active",
    },
    user: {
      displayName: "Test User",
      email: "test@example.com",
      id: "user-1",
      status: "active",
    },
    ...overrides,
  };
}

function renderRouter() {
  return render(
    <AuthContext.Provider value={createAuthState()}>
      <AppRouter />
    </AuthContext.Provider>,
  );
}

describe("WorkbenchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:local-ref-preview");

    useImageModelCatalogMock.mockReturnValue({
      error: null,
      loading: false,
      models: [
        {
          defaultSize: "1k",
          id: "pixellelabs.nano-banana-pro",
          label: "Nano Banana Pro",
          modelFamily: "pixellelabs.nano-banana-pro",
          routeFamily: "pixellelabs.nano-banana-pro",
          sizeOptions: ["1k", "2k", "4k"],
        },
        {
          defaultSize: "1k",
          id: "gpt-image-2",
          label: "GPT-Image-2",
          modelFamily: "gpt-image-2",
          routeFamily: "gpt-image-2",
          sizeOptions: ["auto", "1k", "2k", "4k"],
        },
      ],
    });

    listAiModelRoutesMock.mockResolvedValue([
      {
        estimatedCredits: 1,
        minChargeCredits: 1,
        modality: "image",
        modelFamily: "pixellelabs.nano-banana-pro",
        modelKey: "pixellelabs.nano-banana-pro",
        pricingUnit: "image_generation",
        providerKey: "pixellelabs",
        providerName: "PixelleLabs",
        routeId: "route-1",
        routeKey: "image.pixellelabs.nano-banana-pro",
        routeLabel: "线路一",
      },
    ]);

    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [createGeneration()],
      nextCursor: null,
    });
    createWorkbenchGenerationMock.mockResolvedValue(createGeneration({ id: "generation-created", status: "succeeded" }));
    getWorkbenchGenerationMock.mockResolvedValue(createGeneration({ status: "succeeded" }));
    retryWorkbenchGenerationMock.mockResolvedValue(createGeneration({ id: "generation-retry", status: "succeeded" }));
    getAssetMock.mockImplementation(async (assetId: string) => ({
      id: assetId,
      originalFilename: `${assetId}.png`,
      previewUrl: "",
      title: `${assetId}.png`,
    }));
    getAssetVariantUrlMock.mockImplementation(async (assetId: string) => ({
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      method: "GET",
      url: `https://example.com/${assetId}.png`,
      variantKey: "preview",
    }));
    uploadWorkbenchReferenceFileMock.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      originalFilename: "ref.png",
      previewUrl: "blob:local-ref-preview",
    });
  });

  test("renders /workbench under the shared shell", async () => {
    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByText("独立生图工作台")).toBeTruthy();
    expect(screen.getByLabelText("Prompt")).toBeTruthy();
  });

  test("renders the compact TapNow-style workbench composer controls", async () => {
    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByText("参考图")).toBeTruthy();
    expect(screen.getByText("0/10")).toBeTruthy();
    expect(screen.getByText("优化 (0.5 金币)")).toBeTruthy();
    expect(screen.getByText("图像模型")).toBeTruthy();
    expect(screen.getByText("画面比例")).toBeTruthy();
    expect(screen.getByText("画质尺寸")).toBeTruthy();
    expect(screen.getByText("当前配置消耗")).toBeTruthy();
    expect(screen.getByTestId("workbench-route-row").className).toContain("grid gap-1.5");
    expect(screen.getByTestId("workbench-param-row").className).toContain("grid-cols-3");
    expect(screen.getByRole("button", { name: "立即开始创作" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /画面比例/ }));
    expect(screen.getByTestId("workbench-select-menu-画面比例").className).toContain("bottom-[calc(100%+4px)]");
    expect(screen.getByTestId("workbench-aspect-icon-9:16").getAttribute("style")).not.toBe(
      screen.getByTestId("workbench-aspect-icon-16:9").getAttribute("style"),
    );
  });

  test("redirects project workbench routes to /workbench", async () => {
    setRoute("/projects/project-1/workbench");
    renderRouter();

    await waitFor(() => {
      expect(window.location.pathname).toBe("/workbench");
    });
  });

  test("uploads a reference image with immediate local preview through temporary workbench uploads", async () => {
    setRoute("/workbench");
    const { container } = renderRouter();

    expect(await screen.findByText("参考图")).toBeTruthy();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();

    uploadWorkbenchReferenceFileMock
      .mockResolvedValueOnce({
        id: "11111111-1111-4111-8111-111111111111",
        originalFilename: "ref.png",
        previewUrl: "blob:local-ref-preview",
      })
      .mockResolvedValueOnce({
        id: "22222222-2222-4222-8222-222222222222",
        originalFilename: "ref-2.png",
        previewUrl: "blob:local-ref-preview",
      })
      .mockResolvedValueOnce({
        id: "33333333-3333-4333-8333-333333333333",
        originalFilename: "ref-3.png",
        previewUrl: "blob:local-ref-preview",
      });

    fireEvent.change(input!, {
      target: {
        files: [
          new File(["ref"], "ref.png", { type: "image/png" }),
          new File(["ref2"], "ref-2.png", { type: "image/png" }),
          new File(["ref3"], "ref-3.png", { type: "image/png" }),
        ],
      },
    });

    expect(screen.getByAltText("参考图1").getAttribute("src")).toBe("blob:local-ref-preview");
    expect(screen.getByTestId("workbench-reference-strip").className).toContain("overflow-x-auto");
    expect(screen.getByTestId("workbench-reference-strip").className).toContain("[scrollbar-width:none]");
    expect(screen.getByTestId("workbench-reference-strip").getAttribute("data-scrollbar")).toBe("visible");
    expect(screen.getByTestId("workbench-reference-scrollbar").className).toContain("h-[8px]");
    expect(screen.getByTestId("workbench-reference-scrollbar-thumb").className).toContain("bg-[#ff4d55]");
    expect(screen.getByRole("button", { name: "移除参考图1" }).className).toContain("opacity-0");

    await waitFor(() => {
      expect(uploadWorkbenchReferenceFileMock).toHaveBeenCalledTimes(3);
    });
    expect(screen.queryByText("上传结果")).toBeNull();
    expect(screen.queryByText("ref.png")).toBeNull();

    expect(getAssetVariantUrlMock).not.toHaveBeenCalled();

    fireEvent.dragStart(screen.getByTestId("workbench-reference-card-1"));
    fireEvent.drop(screen.getByTestId("workbench-reference-card-3"));
    fireEvent.dragEnd(screen.getByTestId("workbench-reference-card-1"));

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "参考 @图1 生成海报" },
    });
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "立即开始创作" }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: "立即开始创作" }));

    await waitFor(() => {
      expect(createWorkbenchGenerationMock).toHaveBeenCalledTimes(1);
    });
    expect(createWorkbenchGenerationMock.mock.calls[0]?.[0]).toMatchObject({
      referenceAssetIds: [],
      referenceUploadIds: ["22222222-2222-4222-8222-222222222222"],
    });
  });

  test("submits only referenced images when prompt contains @图N tags", async () => {
    setRoute("/workbench");
    const { container } = renderRouter();

    expect(await screen.findByText("参考图")).toBeTruthy();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();

    uploadWorkbenchReferenceFileMock
      .mockResolvedValueOnce({
        id: "11111111-1111-4111-8111-111111111111",
        originalFilename: "ref-1.png",
        previewUrl: "blob:local-ref-preview",
      })
      .mockResolvedValueOnce({
        id: "22222222-2222-4222-8222-222222222222",
        originalFilename: "ref-2.png",
        previewUrl: "blob:local-ref-preview",
      });

    fireEvent.change(input!, {
      target: {
        files: [
          new File(["ref1"], "ref-1.png", { type: "image/png" }),
          new File(["ref2"], "ref-2.png", { type: "image/png" }),
        ],
      },
    });

    expect(await screen.findByText("图2")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "参考 @图2 生成海报" },
    });

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "立即开始创作" }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: "立即开始创作" }));

    await waitFor(() => {
      expect(createWorkbenchGenerationMock).toHaveBeenCalledTimes(1);
    });
    expect(createWorkbenchGenerationMock.mock.calls[0]?.[0]).toMatchObject({
      referenceAssetIds: [],
      referenceUploadIds: ["22222222-2222-4222-8222-222222222222"],
    });
  });

  test("loads result preview from asset id when API result has no preview url", async () => {
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        createGeneration({
          id: "generation-with-result",
          results: [
            {
              assetId: "asset-result-1",
              createdAt: new Date().toISOString(),
              downloadUrl: null,
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "result-1",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "result.png",
              previewUrl: null,
              previewUrlExpiresAt: null,
              sortOrder: 0,
              status: "available",
              width: 1024,
            },
          ],
          status: "succeeded",
        }),
      ],
      nextCursor: null,
    });

    setRoute("/workbench");
    renderRouter();

    await waitFor(() => {
      expect(getAssetVariantUrlMock).toHaveBeenCalledWith("asset-result-1", "preview");
    });
    expect((await screen.findByAltText("result.png")).getAttribute("src")).toBe("https://example.com/asset-result-1.png");
  });

  test("loads result detail preview from asset id when selected result has no preview url", async () => {
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        createGeneration({
          id: "generation-with-result",
          results: [
            {
              assetId: "asset-result-detail-1",
              createdAt: new Date().toISOString(),
              downloadUrl: null,
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "result-detail-1",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "detail.png",
              previewUrl: null,
              previewUrlExpiresAt: null,
              sortOrder: 0,
              status: "available",
              width: 1024,
            },
          ],
          status: "succeeded",
        }),
      ],
      nextCursor: null,
    });

    setRoute("/workbench");
    renderRouter();

    fireEvent.click(await screen.findByAltText("detail.png"));

    await screen.findByText("结果详情");
    await waitFor(() => {
      expect(getAssetVariantUrlMock).toHaveBeenCalledWith("asset-result-detail-1", "preview");
    });
    const detailImages = screen.getAllByAltText("detail.png");
    expect(detailImages.some((image) => image.getAttribute("src") === "https://example.com/asset-result-detail-1.png")).toBe(true);
  });
});
