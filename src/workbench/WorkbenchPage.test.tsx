import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AppRouter } from "../app/AppRouter";
import { AuthContext, type AuthState } from "../auth/useAuth";
import { clearWorkbenchGenerationMemoryCache } from "./useWorkbenchGenerations";

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
const getBillingSummaryMock = vi.fn();
const downloadOriginalImageMock = vi.fn();

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

vi.mock("../billing/billingApi", async () => {
  const actual = await vi.importActual("../billing/billingApi");
  return {
    ...actual,
    getBillingSummary: (...args: unknown[]) => getBillingSummaryMock(...args),
  };
});

vi.mock("../flowCanvas/utils/imageDownload", async () => {
  const actual = await vi.importActual("../flowCanvas/utils/imageDownload");
  return {
    ...actual,
    downloadOriginalImage: (...args: unknown[]) => downloadOriginalImageMock(...args),
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
    downloadOriginalImageMock.mockReset();
    clearWorkbenchGenerationMemoryCache();

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
    getBillingSummaryMock.mockResolvedValue({
      account: {
        balanceCents: 0,
        currency: "credits",
        reservedCents: 0,
        status: "active",
      },
      availableCredits: 0,
      creditGrants: {
        availableCredits: 0,
        expiringCredits: 0,
        expiringCreditsExpireAt: null,
        lifetimeCredits: 0,
      },
      membership: {
        tier: "standard",
      },
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
    expect(screen.getByRole("button", { name: "图像模型 Nano Banana Pro" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "线路 Nano Banana Pro 线路一" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "画面比例 1:1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "画质尺寸 2K" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "数量 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "立即开始创作" })).toBeTruthy();
  });

  test("renders a mobile-first bottom creation dock instead of the legacy floating composer button", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByTestId("workbench-page")).toBeTruthy();
    expect(screen.getByTestId("workbench-mobile-bottom-dock")).toBeTruthy();
    const createBar = screen.getByTestId("workbench-mobile-create-bar");
    expect(createBar).toBeTruthy();
    expect(within(createBar).getByText("图片生成")).toBeTruthy();
    expect(screen.getByText("请描述画面内容")).toBeTruthy();
    expect(screen.getByTestId("workbench-mobile-create-bar").textContent).not.toContain("Nano Banana Pro");
    expect(screen.getByTestId("workbench-mobile-create-bar").textContent).not.toContain("1:1");
    expect(screen.getByTestId("workbench-mobile-create-bar").textContent).not.toContain("2K");
    expect(screen.getByTestId("workbench-mobile-bottom-dock").textContent).not.toContain("线路");
    expect(screen.getByTestId("workbench-mobile-bottom-dock").textContent).not.toContain("轻触打开完整创作面板");
    expect(screen.getByTestId("workbench-mobile-create-bar").className).toContain("h-11");
    expect(screen.queryByTestId("workbench-mobile-generate-button")).toBeNull();
    expect(screen.queryByLabelText("打开参考图")).toBeNull();
    expect(screen.queryByTestId("workbench-mobile-legacy-launcher")).toBeNull();
  });

  test("renders a single compact mobile header and dedicated scroll container", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByTestId("workbench-mobile-shell")).toBeTruthy();
    expect(screen.getByTestId("workbench-mobile-header")).toBeTruthy();
    expect(screen.getAllByText("创作工作台")).toHaveLength(1);
    expect(screen.getByLabelText("返回首页").className).toContain("h-9");
    expect(screen.queryByLabelText("历史")).toBeNull();
    expect(screen.getByTestId("workbench-mobile-scroll-area").className).toContain("overflow-x-hidden");
    expect(screen.getByTestId("workbench-mobile-scroll-area").className).toContain("overscroll-y-contain");
  });

  test("uses the real billing balance in desktop and mobile workbench headers", async () => {
    setRoute("/workbench");
    renderRouter();

    await waitFor(() => {
      expect(getBillingSummaryMock).toHaveBeenCalled();
    });
    expect(screen.getByTestId("workbench-credit-balance").textContent).toBe("0");
    expect(screen.queryByText("19071")).toBeNull();

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    setRoute("/workbench");
    renderRouter();

    await waitFor(() => {
      expect(screen.getByTestId("workbench-mobile-credit-balance").textContent).toBe("0");
    });
    expect(screen.queryByText("19071")).toBeNull();
  });

  test("opens the mobile parameter sheet from the bottom creation dock", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByTestId("workbench-mobile-bottom-dock")).toBeTruthy();
    fireEvent.click(screen.getByTestId("workbench-mobile-create-bar"));
    expect(await screen.findByTestId("workbench-mobile-parameter-sheet")).toBeTruthy();
    expect(screen.getByLabelText("Prompt")).toBeTruthy();
    expect(screen.getByTestId("workbench-composer")).toBeTruthy();
  });

  test("renders a single mobile creation-feed card for multi-image generations", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        createGeneration({
          id: "mobile-done-quad",
          requestedCount: 4,
          status: "succeeded",
          results: [0, 1, 2, 3].map((index) => ({
            assetId: `mobile-done-quad-asset-${index + 1}`,
            createdAt: new Date().toISOString(),
            downloadUrl: `https://example.com/mobile-done-quad-${index + 1}.png`,
            downloadUrlExpiresAt: null,
            height: 1024,
            id: `mobile-done-quad-result-${index + 1}`,
            metadata: {},
            mimeType: "image/png",
            originalFilename: `mobile-done-quad-${index + 1}.png`,
            previewUrl: `https://example.com/mobile-done-quad-${index + 1}.png`,
            previewUrlExpiresAt: null,
            sortOrder: index,
            status: "available",
            width: 1024,
          })),
        }),
      ],
      nextCursor: null,
    });
    setRoute("/workbench");
    renderRouter();

    const feed = await screen.findByTestId("workbench-mobile-result-feed");
    expect(within(feed).getAllByTestId("workbench-mobile-creation-feed-card")).toHaveLength(1);
    expect(screen.getAllByAltText("mobile-done-quad-1.png").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("workbench-mobile-feed-slot-mobile-done-quad")).toHaveLength(4);
    expect(screen.getByText("共4张，已完成")).toBeTruthy();
    expect(screen.getByLabelText("打开结果菜单-mobile-done-quad")).toBeTruthy();
  });

  test("initial mobile result feed renders only the newest four cards and loads older cards when scrolled to top", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const generations = Array.from({ length: 6 }, (_, index) =>
      createGeneration({
        createdAt: `2026-06-19T08:0${index}:00.000Z`,
        id: `mobile-feed-${index}`,
        prompt: `mobile prompt ${index}`,
        status: "succeeded",
        results: [
          {
            assetId: `mobile-feed-asset-${index}`,
            createdAt: `2026-06-19T08:0${index}:00.000Z`,
            downloadUrl: `https://example.com/mobile-feed-${index}.png`,
            downloadUrlExpiresAt: null,
            height: 1024,
            id: `mobile-feed-result-${index}`,
            metadata: {},
            mimeType: "image/png",
            originalFilename: `mobile-feed-${index}.png`,
            previewUrl: `https://example.com/mobile-feed-${index}.png`,
            previewUrlExpiresAt: null,
            sortOrder: 0,
            status: "available",
            width: 1024,
          },
        ],
      }),
    );
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations,
      nextCursor: null,
    });

    setRoute("/workbench");
    renderRouter();

    const feed = await screen.findByTestId("workbench-mobile-result-feed");
    expect(within(feed).getAllByTestId("workbench-mobile-creation-feed-card")).toHaveLength(4);
    expect(screen.queryByText("mobile prompt 0")).toBeNull();
    expect(screen.queryByText("mobile prompt 1")).toBeNull();
    expect(screen.getByText("mobile prompt 2")).toBeTruthy();
    expect(screen.getByText("mobile prompt 5")).toBeTruthy();

    fireEvent.scroll(screen.getByTestId("workbench-mobile-scroll-area"), {
      currentTarget: { scrollTop: 0 },
    });

    expect(within(feed).getAllByTestId("workbench-mobile-creation-feed-card")).toHaveLength(6);
    expect(screen.getByText("mobile prompt 0")).toBeTruthy();
    expect(screen.getByText("mobile prompt 1")).toBeTruthy();
  });

  test("reopens the mobile workbench from the short-lived generation cache while refreshing in the background", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const cachedGeneration = createGeneration({
      id: "mobile-cache-generation",
      prompt: "cached mobile prompt",
      status: "succeeded",
      results: [
        {
          assetId: "mobile-cache-asset",
          createdAt: "2026-06-19T08:00:00.000Z",
          downloadUrl: "https://example.com/mobile-cache.png",
          downloadUrlExpiresAt: null,
          height: 1024,
          id: "mobile-cache-result",
          metadata: {},
          mimeType: "image/png",
          originalFilename: "mobile-cache.png",
          previewUrl: "https://example.com/mobile-cache.png",
          previewUrlExpiresAt: null,
          sortOrder: 0,
          status: "available",
          width: 1024,
        },
      ],
    });
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [cachedGeneration],
      nextCursor: null,
    });

    setRoute("/workbench");
    const firstRender = renderRouter();
    expect(await screen.findByText("cached mobile prompt")).toBeTruthy();
    firstRender.unmount();

    listWorkbenchGenerationsMock.mockImplementation(() => new Promise(() => undefined));
    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByText("cached mobile prompt")).toBeTruthy();
    expect(screen.queryByText("正在加载工作台内容...")).toBeNull();
    expect(listWorkbenchGenerationsMock).toHaveBeenCalledTimes(2);
  });

  test("opens the tapped mobile feed image directly in fullscreen preview", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        createGeneration({
          id: "mobile-switch",
          requestedCount: 2,
          status: "succeeded",
          results: [
            {
              assetId: "mobile-switch-asset-1",
              createdAt: new Date().toISOString(),
              downloadUrl: "https://example.com/mobile-switch-1.png",
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "mobile-switch-result-1",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "mobile-switch-1.png",
              previewUrl: "https://example.com/mobile-switch-1.png",
              previewUrlExpiresAt: null,
              sortOrder: 0,
              status: "available",
              width: 1024,
            },
            {
              assetId: "mobile-switch-asset-2",
              createdAt: new Date().toISOString(),
              downloadUrl: "https://example.com/mobile-switch-2.png",
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "mobile-switch-result-2",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "mobile-switch-2.png",
              previewUrl: "https://example.com/mobile-switch-2.png",
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

    expect(await screen.findByTestId("workbench-mobile-result-feed")).toBeTruthy();
    fireEvent.click(screen.getByTestId("workbench-mobile-thumb-mobile-switch-mobile-switch-result-2"));
    await screen.findByTestId("workbench-result-fullscreen");
    await waitFor(() => {
      expect(screen.getByTestId("workbench-result-fullscreen-image").getAttribute("src")).toBe(
        "https://example.com/mobile-switch-asset-2.png",
      );
    });
  });

  test("renders mobile workbench as one chronological creation feed with pending batch placeholders", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const olderCreatedAt = "2026-06-19T08:00:00.000Z";
    const newerCreatedAt = "2026-06-19T09:00:00.000Z";
    const newestActiveGeneration = createGeneration({
      createdAt: newerCreatedAt,
      id: "mobile-newest-active",
      params: { aspect_ratio: "9:16", size: "2k" },
      prompt: "动物运动会，3D风格",
      requestedCount: 4,
      status: "running",
      results: [
        {
          assetId: "mobile-newest-active-asset-1",
          createdAt: newerCreatedAt,
          downloadUrl: "https://example.com/mobile-newest-active-1.png",
          downloadUrlExpiresAt: null,
          height: 1024,
          id: "mobile-newest-active-result-1",
          metadata: {},
          mimeType: "image/png",
          originalFilename: "mobile-newest-active-1.png",
          previewUrl: "https://example.com/mobile-newest-active-1.png",
          previewUrlExpiresAt: null,
          sortOrder: 0,
          status: "available",
          width: 1024,
        },
        {
          assetId: "mobile-newest-active-asset-2",
          createdAt: newerCreatedAt,
          downloadUrl: "https://example.com/mobile-newest-active-2.png",
          downloadUrlExpiresAt: null,
          height: 1024,
          id: "mobile-newest-active-result-2",
          metadata: {},
          mimeType: "image/png",
          originalFilename: "mobile-newest-active-2.png",
          previewUrl: "https://example.com/mobile-newest-active-2.png",
          previewUrlExpiresAt: null,
          sortOrder: 1,
          status: "available",
          width: 1024,
        },
      ],
    });
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        newestActiveGeneration,
        createGeneration({
          createdAt: olderCreatedAt,
          id: "mobile-older-done",
          params: { aspect_ratio: "1:1", size: "1k" },
          prompt: "赛博城市夜景",
          requestedCount: 1,
          status: "succeeded",
          results: [
            {
              assetId: "mobile-older-done-asset-1",
              createdAt: olderCreatedAt,
              downloadUrl: "https://example.com/mobile-older-done-1.png",
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "mobile-older-done-result-1",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "mobile-older-done-1.png",
              previewUrl: "https://example.com/mobile-older-done-1.png",
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
    getWorkbenchGenerationMock.mockResolvedValue(newestActiveGeneration);

    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByTestId("workbench-mobile-shell")).toBeTruthy();
    expect(screen.getByTestId("workbench-mobile-header")).toBeTruthy();
    expect(screen.getByTestId("workbench-mobile-bottom-dock")).toBeTruthy();
    expect(screen.queryByTestId("workbench-mobile-current-stage")).toBeNull();
    expect(screen.queryByText("Current Tasks")).toBeNull();
    expect(screen.queryByText("Completed")).toBeNull();

    const feed = screen.getByTestId("workbench-mobile-result-feed");
    const cards = within(feed).getAllByTestId("workbench-mobile-creation-feed-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain("赛博城市夜景");
    expect(cards[1]?.textContent).toContain("动物运动会，3D风格");
    expect(cards[1]?.textContent).toContain("图片生成");
    expect(cards[1]?.textContent).toContain("Nano Banana Pro");
    expect(cards[1]?.textContent).toContain("线路一");
    expect(cards[1]?.textContent).toContain("9:16");
    expect(cards[1]?.textContent).toContain("2K");
    expect(cards[1]?.textContent).toContain("共4张");
    expect(cards[1]?.textContent).toContain("正在生成");
    expect(screen.getAllByTestId("workbench-mobile-feed-slot-mobile-newest-active")).toHaveLength(4);
    expect(screen.getAllByTestId("workbench-mobile-feed-pending-slot-mobile-newest-active")).toHaveLength(2);
  });

  test("shows generated time and lazy-renders older mobile feed records when scrolling upward", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const scrollToMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollToMock,
    });
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: Array.from({ length: 10 }, (_, index) =>
        createGeneration({
          createdAt: `2026-06-19T${String(8 + index).padStart(2, "0")}:02:00`,
          id: `mobile-history-${index}`,
          params: { aspect_ratio: "16:9", size: "2k" },
          prompt: `history prompt ${index}`,
          requestedCount: 1,
          results: [
            {
              assetId: `mobile-history-asset-${index}`,
              createdAt: `2026-06-19T${String(8 + index).padStart(2, "0")}:02:00`,
              downloadUrl: `https://example.com/mobile-history-${index}.png`,
              downloadUrlExpiresAt: null,
              height: 1024,
              id: `mobile-history-result-${index}`,
              metadata: {},
              mimeType: "image/png",
              originalFilename: `mobile-history-${index}.png`,
              previewUrl: `https://example.com/mobile-history-${index}.png`,
              previewUrlExpiresAt: null,
              sortOrder: 0,
              status: "available",
              width: 1024,
            },
          ],
          status: "succeeded",
        }),
      ),
      nextCursor: null,
    });

    setRoute("/workbench");
    renderRouter();

    const feed = await screen.findByTestId("workbench-mobile-result-feed");
    await waitFor(() => {
      expect(scrollToMock).toHaveBeenCalled();
    });
    expect(within(feed).getAllByTestId("workbench-mobile-creation-feed-card")).toHaveLength(4);
    expect(screen.queryByText("history prompt 0")).toBeNull();
    expect(screen.getByText("history prompt 9")).toBeTruthy();
    expect(screen.getByText((content) =>
      content.includes("Nano Banana Pro")
      && content.includes("16:9")
      && content.includes("2K")
      && content.includes("17:02"),
    )).toBeTruthy();

    fireEvent.scroll(screen.getByTestId("workbench-mobile-scroll-area"), { target: { scrollTop: 0 } });

    await waitFor(() => {
      expect(within(feed).getAllByTestId("workbench-mobile-creation-feed-card")).toHaveLength(8);
    });
    expect(screen.getByText("history prompt 2")).toBeTruthy();
    expect(screen.queryByText("history prompt 0")).toBeNull();

    fireEvent.scroll(screen.getByTestId("workbench-mobile-scroll-area"), { target: { scrollTop: 0 } });

    await waitFor(() => {
      expect(within(feed).getAllByTestId("workbench-mobile-creation-feed-card")).toHaveLength(10);
    });
    expect(screen.getByText("history prompt 0")).toBeTruthy();
  });

  test("mobile feed regenerate action refills the prompt and opens the parameter sheet", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        createGeneration({
          id: "mobile-regenerate",
          params: { aspect_ratio: "9:16", size: "4k" },
          prompt: "mobile regenerate prompt",
          requestedCount: 2,
          results: [
            {
              assetId: "mobile-regenerate-asset",
              createdAt: new Date().toISOString(),
              downloadUrl: "https://example.com/mobile-regenerate.png",
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "mobile-regenerate-result",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "mobile-regenerate.png",
              previewUrl: "https://example.com/mobile-regenerate.png",
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

    expect(await screen.findByText("mobile regenerate prompt")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("打开结果菜单-mobile-regenerate"));
    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));

    expect(await screen.findByTestId("workbench-mobile-parameter-sheet")).toBeTruthy();
    expect((screen.getByLabelText("Prompt") as HTMLTextAreaElement).value).toBe("mobile regenerate prompt");
    expect(screen.getByRole("button", { name: "画面比例 9:16" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "画质尺寸 4K" })).toBeTruthy();
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

  test("renders four completed images in one visible thumbnail strip with a single selected action tray", async () => {
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        createGeneration({
          id: "done-quad",
          requestedCount: 4,
          results: [0, 1, 2, 3].map((index) => ({
            assetId: `done-quad-asset-${index + 1}`,
            createdAt: new Date().toISOString(),
            downloadUrl: `https://example.com/done-quad-${index + 1}.png`,
            downloadUrlExpiresAt: null,
            height: 1024,
            id: `done-quad-result-${index + 1}`,
            metadata: {},
            mimeType: "image/png",
            originalFilename: `done-quad-${index + 1}.png`,
            previewUrl: `https://example.com/done-quad-${index + 1}.png`,
            previewUrlExpiresAt: null,
            sortOrder: index,
            status: "available",
            width: 1024,
          })),
          status: "succeeded",
        }),
      ],
      nextCursor: null,
    });

    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByTestId("workbench-completed-history-item-done-quad")).toBeTruthy();
    expect(screen.getAllByTestId("workbench-completed-result-thumb-done-quad").length).toBe(4);
    expect(screen.getByTestId("workbench-result-thumb-row-done-quad").children.length).toBe(4);
    expect(screen.getByTestId("workbench-result-action-panel-done-quad")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "select-result-done-quad-result-2" })).toBeTruthy();
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
    expect(screen.queryByRole("button", { name: "收起参数面板" })).toBeNull();
    expect(screen.queryByRole("button", { name: "展开参数面板" })).toBeNull();
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
    expect(screen.getByTestId("workbench-result-fullscreen-image").className).toContain("max-h-[calc(100dvh-220px)]");
    expect(screen.getByTestId("workbench-result-fullscreen-image").className).toContain("w-auto");
    expect(screen.getByTestId("workbench-result-fullscreen-image").className).toContain("max-w-[calc(100vw-48px)]");
  });

  test("supports switching images inside fullscreen preview for the same mobile batch", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
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
          id: "mobile-preview-batch",
          requestedCount: 2,
          status: "succeeded",
          results: [
            {
              assetId: "mobile-preview-asset-1",
              createdAt: new Date().toISOString(),
              downloadUrl: null,
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "mobile-preview-result-1",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "mobile-preview-1.png",
              previewUrl: "https://example.com/mobile-preview-1-thumb.webp",
              previewUrlExpiresAt: null,
              sortOrder: 0,
              status: "available",
              width: 1024,
            },
            {
              assetId: "mobile-preview-asset-2",
              createdAt: new Date().toISOString(),
              downloadUrl: null,
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "mobile-preview-result-2",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "mobile-preview-2.png",
              previewUrl: "https://example.com/mobile-preview-2-thumb.webp",
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

    expect(await screen.findByTestId("workbench-mobile-result-feed")).toBeTruthy();
    fireEvent.click(screen.getByTestId("workbench-mobile-thumb-mobile-preview-batch-mobile-preview-result-2"));

    await screen.findByTestId("workbench-result-fullscreen");
    expect(screen.getByText("结果预览")).toBeTruthy();
    expect(screen.queryByText("Result Preview")).toBeNull();
    expect(screen.queryByText("Send To Canvas")).toBeNull();
    expect(screen.getByRole("button", { name: "下载原图" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "引用参考" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新生成" })).toBeTruthy();
    expect(screen.getByTestId("workbench-result-fullscreen-image").getAttribute("src")).toBe(
      "https://example.com/mobile-preview-asset-2-original.png",
    );

    fireEvent.click(screen.getByTestId("workbench-result-fullscreen-prev"));
    await waitFor(() => {
      expect(screen.getByTestId("workbench-result-fullscreen-image").getAttribute("src")).toBe(
        "https://example.com/mobile-preview-asset-1-original.png",
      );
    });

    fireEvent.click(screen.getByTestId("workbench-result-fullscreen-next"));
    await waitFor(() => {
      expect(screen.getByTestId("workbench-result-fullscreen-image").getAttribute("src")).toBe(
        "https://example.com/mobile-preview-asset-2-original.png",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));
    expect(await screen.findByTestId("workbench-mobile-parameter-sheet")).toBeTruthy();
    expect((screen.getByLabelText("Prompt") as HTMLTextAreaElement).value).toBe("Product poster");
  });

  test("keeps mobile fullscreen preview actions above the bottom dock safe area", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        createGeneration({
          id: "mobile-preview-safe-area",
          status: "succeeded",
          results: [
            {
              assetId: "mobile-preview-safe-asset",
              createdAt: new Date().toISOString(),
              downloadUrl: "https://example.com/mobile-preview-safe.png",
              downloadUrlExpiresAt: null,
              height: 1024,
              id: "mobile-preview-safe-result",
              metadata: {},
              mimeType: "image/png",
              originalFilename: "mobile-preview-safe.png",
              previewUrl: "https://example.com/mobile-preview-safe.png",
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

    expect(await screen.findByTestId("workbench-mobile-result-feed")).toBeTruthy();
    fireEvent.click(screen.getByTestId("workbench-mobile-thumb-mobile-preview-safe-area-mobile-preview-safe-result"));

    expect(await screen.findByTestId("workbench-result-fullscreen")).toBeTruthy();
    expect(screen.getByTestId("workbench-result-fullscreen").className).toContain("bg-black");
    expect(screen.getByTestId("workbench-result-fullscreen-actions").className).toContain("pb-[calc(env(safe-area-inset-bottom,0px)+88px)]");
    expect(screen.getByTestId("workbench-result-fullscreen-image").className).toContain("max-h-[calc(100dvh-220px)]");
  });

  test("uses ratio-aware mobile thumbnail mosaics for wide three and four image batches", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const wideResult = (generationId: string, index: number, width = 1792, height = 1024) => ({
      assetId: `${generationId}-asset-${index}`,
      createdAt: new Date().toISOString(),
      downloadUrl: `https://example.com/${generationId}-${index}.png`,
      downloadUrlExpiresAt: null,
      height,
      id: `${generationId}-result-${index}`,
      metadata: {},
      mimeType: "image/png",
      originalFilename: `${generationId}-${index}.png`,
      previewUrl: `https://example.com/${generationId}-${index}.png`,
      previewUrlExpiresAt: null,
      sortOrder: index,
      status: "available",
      width,
    });
    listWorkbenchGenerationsMock.mockResolvedValue({
      generations: [
        createGeneration({
          id: "mobile-wide-three",
          params: { aspect_ratio: "16:9", size: "2k" },
          requestedCount: 3,
          status: "succeeded",
          results: [wideResult("mobile-wide-three", 0), wideResult("mobile-wide-three", 1), wideResult("mobile-wide-three", 2)],
        }),
        createGeneration({
          id: "mobile-wide-four",
          params: { aspect_ratio: "21:9", size: "2k" },
          requestedCount: 4,
          status: "succeeded",
          results: [
            wideResult("mobile-wide-four", 0, 2048, 878),
            wideResult("mobile-wide-four", 1, 2048, 878),
            wideResult("mobile-wide-four", 2, 2048, 878),
            wideResult("mobile-wide-four", 3, 2048, 878),
          ],
        }),
      ],
      nextCursor: null,
    });

    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByTestId("workbench-mobile-mosaic-mobile-wide-three")).toBeTruthy();
    expect(screen.getByTestId("workbench-mobile-mosaic-mobile-wide-three").className).toContain("grid-cols-2");
    expect(document.getElementById("workbench-mobile-feed-slot-mobile-wide-three-2")?.className).toContain("col-span-1");
    expect(document.getElementById("workbench-mobile-feed-slot-mobile-wide-three-2")?.className).toContain("aspect-[16/9]");
    expect(screen.getByTestId("workbench-mobile-feed-image-mobile-wide-three-mobile-wide-three-result-2").className).toContain("object-cover");

    expect(screen.getByTestId("workbench-mobile-mosaic-mobile-wide-four").className).toContain("grid-cols-2");
    expect(screen.getAllByTestId("workbench-mobile-feed-slot-mobile-wide-four")).toHaveLength(4);
    expect(document.getElementById("workbench-mobile-feed-slot-mobile-wide-four-0")?.className).toContain("aspect-[21/9]");
    expect(document.getElementById("workbench-mobile-feed-slot-mobile-wide-four-1")?.className).toContain("aspect-[21/9]");
    expect(screen.getByTestId("workbench-mobile-feed-image-mobile-wide-four-mobile-wide-four-result-1").className).toContain("object-cover");
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
      expect(downloadOriginalImageMock).toHaveBeenCalledWith({
        assetId: "asset-actions",
        fallbackUrl: "https://example.com/asset-actions-cached.png",
        mimeType: "image/png",
        prompt: "done actions",
        sequence: 1,
      });
    });
    expect(openMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "引用参考" }));
    expect((await screen.findByAltText("参考图1")).getAttribute("src")).toBe("https://example.com/asset-actions-preview.webp");

    fireEvent.click(screen.getByRole("button", { name: "删除记录-done-actions" }));
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
    expect(screen.getByTestId("workbench-batch-stage-batch-1")).toBeTruthy();
    expect(screen.getByTestId("workbench-batch-thumb-row-batch-1")).toBeTruthy();
    expect(screen.getAllByAltText("one.png").length).toBeGreaterThan(0);
    expect(screen.getByTestId("workbench-batch-child-badge-batch-1-0").textContent).toBe("1");
    expect(screen.getByTestId("workbench-batch-child-image-batch-1-0").className).toContain("object-contain");
    expect(screen.getByRole("button", { name: "再次生成-result-1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "复用参数-result-1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "下载原图-result-1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "引用参考-result-1" })).toBeTruthy();
    expect(screen.getByTestId("workbench-batch-child-placeholder-batch-1-1")).toBeTruthy();
  });
});
