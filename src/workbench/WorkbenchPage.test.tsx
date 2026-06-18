import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AppRouter } from "../app/AppRouter";
import { AuthContext, type AuthState } from "../auth/useAuth";

const useImageModelCatalogMock = vi.fn();
const listAiModelRoutesMock = vi.fn();
const listWorkbenchGenerationsMock = vi.fn();
const createWorkbenchGenerationMock = vi.fn();
const deleteWorkbenchGenerationMock = vi.fn();
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
    deleteWorkbenchGeneration: (...args: unknown[]) => deleteWorkbenchGenerationMock(...args),
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
    batch: null,
    batchId: null,
    batchIndex: null,
    batchRole: "single",
    batchTotal: null,
    chargedCredits: null,
    createdAt: new Date().toISOString(),
    displayMode: "merged",
    errorJson: null,
    estimatedCredits: 1,
    finishedAt: null,
    id: "generation-1",
    modelId: "pixellelabs.nano-banana-pro",
    params: { aspect_ratio: "1:1", size: "1k" },
    parentGenerationId: null,
    prompt: "Product poster",
    referenceAssetIds: [],
    referenceUploadIds: [],
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
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1440,
    });
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
    deleteWorkbenchGenerationMock.mockResolvedValue({ ok: true });
    getWorkbenchGenerationMock.mockImplementation(async (generationId: string) =>
      createGeneration({ id: generationId, status: "succeeded" }),
    );
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

  test("renders /workbench as a fullscreen studio route outside the shared shell", async () => {
    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByTestId("workbench-page")).toBeTruthy();
    expect(screen.getByLabelText("Prompt")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /AI Flow/i })).toBeNull();
    expect(screen.queryByText("WORKBENCH")).toBeNull();
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
    expect(screen.getByTestId("workbench-composer").className).toContain("workbench-composer");
    expect(screen.getByTestId("workbench-route-row").className).toContain("grid gap-1.5");
    expect(screen.getByTestId("workbench-param-row").className).toContain("grid-cols-3");
    expect(screen.getByTestId("workbench-composer-footer").className).toContain("shrink-0");
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
    expect(screen.queryByTestId("workbench-reference-scrollbar")).toBeNull();
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

  test("shows a compact interactive scrollbar only when the reference strip overflows", async () => {
    setRoute("/workbench");
    const { container } = renderRouter();

    expect(await screen.findByText("参考图")).toBeTruthy();
    expect(screen.queryByTestId("workbench-reference-scrollbar")).toBeNull();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();

    for (let index = 1; index <= 6; index += 1) {
      uploadWorkbenchReferenceFileMock.mockResolvedValueOnce({
        id: `00000000-0000-4000-8000-0000000000${index.toString().padStart(2, "0")}`,
        originalFilename: `ref-${index}.png`,
        previewUrl: "blob:local-ref-preview",
      });
    }

    fireEvent.change(input!, {
      target: {
        files: Array.from({ length: 6 }, (_, index) =>
          new File([`ref${index + 1}`], `ref-${index + 1}.png`, { type: "image/png" }),
        ),
      },
    });

    await waitFor(() => {
      expect(uploadWorkbenchReferenceFileMock).toHaveBeenCalledTimes(6);
    });
    expect(screen.getByText("6/10")).toBeTruthy();
    expect(screen.getByTestId("workbench-reference-scrollbar").className).toContain("h-[10px]");
    expect(screen.getByTestId("workbench-reference-scrollbar-thumb").className).toContain("bg-[#6f7884]");
    expect(screen.getByTestId("workbench-reference-scrollbar-prev")).toBeTruthy();
    expect(screen.getByTestId("workbench-reference-scrollbar-next")).toBeTruthy();
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
    const resultImages = await screen.findAllByAltText("result.png");
    expect(resultImages.some((image) => image.getAttribute("src") === "https://example.com/asset-result-1.png")).toBe(true);
  });

  test("promotes the newest generation with a result into the center stage when the first row is empty", async () => {
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        createGeneration({
          id: "generation-empty-latest",
          prompt: "latest without result",
          results: [],
          status: "succeeded",
        }),
        createGeneration({
          id: "generation-with-result",
          prompt: "stage hero result",
          results: [
            {
              assetId: "asset-stage-1",
              createdAt: new Date().toISOString(),
              downloadUrl: "https://example.com/stage-hero.png",
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "result-stage-1",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "stage-hero.png",
              previewUrl: "https://example.com/stage-hero.png",
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

    expect((await screen.findAllByAltText("stage-hero.png")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("stage hero result").length).toBeGreaterThan(0);
  });

  test("renders desktop workbench as a two-column 3:7 shell with active band and completed rail", async () => {
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        createGeneration({ id: "queued-1", prompt: "queued", status: "queued" }),
        createGeneration({
          id: "done-1",
          prompt: "done-1",
          status: "succeeded",
          results: [
            {
              assetId: "done-1-asset",
              createdAt: new Date().toISOString(),
              downloadUrl: "https://example.com/done-1.png",
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "done-1-result",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "done-1.png",
              previewUrl: "https://example.com/done-1.png",
              previewUrlExpiresAt: null,
              sortOrder: 0,
              status: "available",
              width: 1024,
            },
          ],
        }),
      ],
      nextCursor: null,
    });

    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByTestId("workbench-page")).toBeTruthy();
    expect(screen.getByTestId("workbench-desktop-layout").className).toContain("lg:grid-cols-[minmax(430px,3fr)_minmax(0,7fr)]");
    expect(screen.getByTestId("workbench-active-band")).toBeTruthy();
    expect(screen.getByTestId("workbench-completed-rail")).toBeTruthy();
    expect(screen.getAllByTestId("workbench-active-item").length).toBe(1);
    expect(screen.getAllByTestId("workbench-completed-history-item").length).toBe(1);
    expect(screen.queryByTestId("workbench-stage")).toBeNull();
  });

  test("keeps the desktop left parameter dock fixed while the results workspace owns scrolling", async () => {
    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByTestId("workbench-page")).toBeTruthy();
    expect(screen.getByTestId("workbench-page").className).toContain("h-screen");
    expect(screen.getByTestId("workbench-header").className).toContain("h-[78px]");
    expect(screen.getByTestId("workbench-desktop-layout").className).toContain("h-[calc(100vh-94px)]");
    expect(screen.getByTestId("workbench-left-dock").className).toContain("h-full");
    expect(screen.getByTestId("workbench-composer").className).toContain("h-full");
    expect(screen.getByTestId("workbench-composer").className).toContain("px-2.5");
    expect(screen.getByTestId("workbench-composer-scroll-body").className).toContain("overscroll-contain");
    expect(screen.getByTestId("workbench-composer-scroll-body").className).toContain("flex-1");
    expect(screen.getByTestId("workbench-results-scroll-area").className).toContain("overflow-y-auto");
    expect(screen.getByTestId("workbench-composer-footer").className).toContain("shrink-0");
  });

  test("renders completed desktop results as horizontal cards in a single-column rail", async () => {
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        createGeneration({
          id: "done-1",
          prompt: "done-1",
          status: "succeeded",
          results: [
            {
              assetId: "done-1-asset",
              createdAt: new Date().toISOString(),
              downloadUrl: "https://example.com/done-1.png",
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "done-1-result",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "done-1.png",
              previewUrl: "https://example.com/done-1.png",
              previewUrlExpiresAt: null,
              sortOrder: 0,
              status: "available",
              width: 1024,
            },
          ],
        }),
      ],
      nextCursor: null,
    });

    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByTestId("workbench-completed-rail")).toBeTruthy();
    expect(screen.getByTestId("workbench-completed-history-list").className).toContain("grid-cols-1");
    expect(screen.getByTestId("workbench-completed-history-item-done-1")).toBeTruthy();
    expect(screen.getByTestId("workbench-completed-history-item-done-1").className).toContain("grid-cols-[minmax(120px,252px)_minmax(0,1fr)]");
  });

  test("renders multiple result previews inside one completed workbench generation card when quantity is greater than one", async () => {
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        createGeneration({
          id: "done-multi",
          prompt: "done-multi",
          requestedCount: 2,
          status: "succeeded",
          results: [
            {
              assetId: "done-multi-asset-1",
              createdAt: new Date().toISOString(),
              downloadUrl: "https://example.com/done-multi-1.png",
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "done-multi-result-1",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "done-multi-1.png",
              previewUrl: "https://example.com/done-multi-1.png",
              previewUrlExpiresAt: null,
              sortOrder: 0,
              status: "available",
              width: 1024,
            },
            {
              assetId: "done-multi-asset-2",
              createdAt: new Date().toISOString(),
              downloadUrl: "https://example.com/done-multi-2.png",
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "done-multi-result-2",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "done-multi-2.png",
              previewUrl: "https://example.com/done-multi-2.png",
              previewUrlExpiresAt: null,
              sortOrder: 1,
              status: "available",
              width: 1024,
            },
          ],
        }),
      ],
      nextCursor: null,
    });

    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByTestId("workbench-completed-history-item-done-multi")).toBeTruthy();
    expect(screen.getByAltText("done-multi-1.png")).toBeTruthy();
    expect(screen.getByAltText("done-multi-2.png")).toBeTruthy();
    expect(screen.getAllByTestId("workbench-completed-result-thumb-done-multi").length).toBe(2);
  });

  test("shows creator-facing generation parameters instead of raw model and route keys", async () => {
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        createGeneration({
          id: "friendly-meta",
          modelId: "pixellelabs.nano-banana-pro",
          params: { aspect_ratio: "16:9", imageSize: "4K", size: "4k" },
          requestedCount: 2,
          routeKey: "image.pixellelabs.nano-banana-pro",
          status: "succeeded",
          results: [
            {
              assetId: "friendly-meta-asset",
              createdAt: new Date().toISOString(),
              downloadUrl: "https://example.com/friendly-meta.png",
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "friendly-meta-result",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "friendly-meta.png",
              previewUrl: "https://example.com/friendly-meta.png",
              previewUrlExpiresAt: null,
              sortOrder: 0,
              status: "available",
              width: 1024,
            },
          ],
        }),
      ],
      nextCursor: null,
    });

    setRoute("/workbench");
    renderRouter();

    const meta = await screen.findByTestId("workbench-generation-params-friendly-meta");
    expect(meta.textContent).toContain("模型：Nano Banana Pro");
    expect(meta.textContent).toContain("线路：线路一");
    expect(meta.textContent).toContain("比例：16:9");
    expect(meta.textContent).toContain("尺寸：4K");
    expect(meta.textContent).toContain("数量：2");
    expect(screen.queryByText("pixellelabs.nano-banana-pro")).toBeNull();
    expect(screen.queryByText("image.pixellelabs.nano-banana-pro")).toBeNull();
  });

  test("keeps the desktop composer footer action area separate from the scroll body", async () => {
    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByTestId("workbench-page")).toBeTruthy();
    expect(screen.getByTestId("workbench-composer-scroll-body")).toBeTruthy();
    expect(screen.getByTestId("workbench-composer-footer")).toBeTruthy();
  });

  test("removes the desktop parameter header chrome and config summary card while keeping actions", async () => {
    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByTestId("workbench-page")).toBeTruthy();
    expect(screen.queryByText("Create")).toBeNull();
    expect(screen.queryByText("参数面板")).toBeNull();
    expect(screen.queryByText("当前配置详情")).toBeNull();
    expect(screen.getByRole("button", { name: "收起参数面板" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "立即开始创作" })).toBeTruthy();
  });

  test("opens selected workbench results in a fullscreen original-image preview", async () => {
    getAssetVariantUrlMock.mockImplementation(async (assetId: string, variantKey?: string) => ({
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      method: "GET",
      url: variantKey === "preview"
        ? `https://example.com/${assetId}-preview.webp`
        : `https://example.com/${assetId}-original.png`,
      variantKey: variantKey ?? null,
    }));
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
              previewUrl: "https://example.com/detail-thumb.webp",
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

    fireEvent.click((await screen.findAllByAltText("detail.png"))[0]!);

    await screen.findByTestId("workbench-result-fullscreen");
    await waitFor(() => {
      expect(getAssetVariantUrlMock).toHaveBeenCalledWith("asset-result-detail-1");
    });
    const detailImages = screen.getAllByAltText("detail.png");
    expect(detailImages.some((image) => image.getAttribute("src") === "https://example.com/asset-result-detail-1-original.png")).toBe(true);
    expect(screen.getByTestId("workbench-result-fullscreen").className).toContain("fixed inset-0");
    expect(screen.getByTestId("workbench-result-fullscreen-image").className).toContain("h-auto");
    expect(screen.getByTestId("workbench-result-fullscreen-image").className).toContain("max-h-[calc(100vh-168px)]");
    expect(screen.getByTestId("workbench-result-fullscreen-image").className).toContain("w-auto");
    expect(screen.getByTestId("workbench-result-fullscreen-image").className).toContain("max-w-[calc(100vw-48px)]");
  });

  test("completed result cards expose download original, use as reference, and delete record actions", async () => {
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);
    getAssetVariantUrlMock.mockImplementation(async (assetId: string, variantKey?: string) => ({
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      method: "GET",
      url: variantKey === "preview"
        ? `https://example.com/${assetId}-preview.webp`
        : `https://example.com/${assetId}-original.png`,
      variantKey: variantKey ?? null,
    }));
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        createGeneration({
          id: "done-actions",
          prompt: "done actions",
          results: [
            {
              assetId: "asset-actions",
              createdAt: new Date().toISOString(),
              downloadUrl: "https://example.com/asset-actions-cached.png",
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "result-actions",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "actions.png",
              previewUrl: "https://example.com/asset-actions-preview.webp",
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

    expect(await screen.findByTestId("workbench-completed-history-item-done-actions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "下载原图" }));
    await waitFor(() => {
      expect(getAssetVariantUrlMock).toHaveBeenCalledWith("asset-actions");
      expect(openMock).toHaveBeenCalledWith("https://example.com/asset-actions-original.png", "_blank", "noopener,noreferrer");
    });

    fireEvent.click(screen.getByRole("button", { name: "引用参考" }));
    expect((await screen.findByAltText("参考图1")).getAttribute("src")).toBe("https://example.com/asset-actions-preview.webp");

    fireEvent.click(screen.getByRole("button", { name: "删除记录" }));
    await waitFor(() => {
      expect(deleteWorkbenchGenerationMock).toHaveBeenCalledWith("done-actions");
      expect(screen.queryByTestId("workbench-completed-history-item-done-actions")).toBeNull();
    });
  });

  test("active task cards expose a delete action for stuck queued tasks", async () => {
    getWorkbenchGenerationMock.mockImplementation(async (generationId: string) =>
      createGeneration({
        createdAt: "2026-06-17T10:00:00.000Z",
        id: generationId,
        prompt: "stuck queued",
        status: "queued",
      }),
    );
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        createGeneration({
          createdAt: "2026-06-17T10:00:00.000Z",
          id: "queued-stuck",
          prompt: "stuck queued",
          status: "queued",
        }),
      ],
      nextCursor: null,
    });

    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByText("stuck queued")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "删除任务" }));
    await waitFor(() => {
      expect(deleteWorkbenchGenerationMock).toHaveBeenCalledWith("queued-stuck");
      expect(screen.queryByText("stuck queued")).toBeNull();
    });
  });

  test("renders partial batch progress with completed child preview and running placeholder", async () => {
    const now = new Date().toISOString();
    const partialBatchGeneration = createGeneration({
      batch: {
        batchId: "batch-1",
        children: [
          {
            batchIndex: 0,
            chargedCredits: null,
            errorJson: null,
            finishedAt: now,
            generationId: "child-1",
            results: [
              {
                assetId: "asset-1",
                createdAt: now,
                downloadUrl: "https://example.com/one.png",
                downloadUrlExpiresAt: null,
                height: 1024,
                id: "result-1",
                metadata: {},
                mimeType: "image/png",
                originalFilename: "one.png",
                previewUrl: "https://example.com/one.png",
                previewUrlExpiresAt: null,
                sortOrder: 0,
                status: "available",
                width: 1024,
              },
            ],
            startedAt: now,
            status: "succeeded",
            updatedAt: now,
          },
          {
            batchIndex: 1,
            chargedCredits: null,
            errorJson: null,
            finishedAt: null,
            generationId: "child-2",
            results: [],
            startedAt: now,
            status: "running",
            updatedAt: now,
          },
        ],
        completedCount: 1,
        failedCount: 0,
        parentGenerationId: "batch-1",
        pendingCount: 0,
        runningCount: 1,
        totalCount: 2,
      },
      batchId: "batch-1",
      batchRole: "parent",
      batchTotal: 2,
      id: "batch-1",
      requestedCount: 2,
      results: [
        {
          assetId: "asset-1",
          createdAt: now,
          downloadUrl: "https://example.com/one.png",
          downloadUrlExpiresAt: null,
          height: 1024,
          id: "result-1",
          metadata: { batchIndex: 0, childGenerationId: "child-1" },
          mimeType: "image/png",
          originalFilename: "one.png",
          previewUrl: "https://example.com/one.png",
          previewUrlExpiresAt: null,
          sortOrder: 0,
          status: "available",
          width: 1024,
        },
      ],
      status: "running",
    });
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [partialBatchGeneration],
      nextCursor: null,
    });
    getWorkbenchGenerationMock.mockResolvedValue(partialBatchGeneration);

    setRoute("/workbench");
    renderRouter();

    expect((await screen.findByTestId("workbench-batch-progress-batch-1")).textContent).toContain("1/2");
    expect(screen.getByAltText("one.png")).toBeTruthy();
    expect(screen.getByTestId("workbench-batch-child-placeholder-batch-1-1")).toBeTruthy();
  });
});
