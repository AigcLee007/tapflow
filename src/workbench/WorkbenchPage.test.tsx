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
const getAssetMock = vi.fn();
const getAssetVariantUrlMock = vi.fn();
const uploadAssetFileMock = vi.fn();

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
  };
});

vi.mock("../assets/assetApi", async () => {
  const actual = await vi.importActual("../assets/assetApi");
  return {
    ...actual,
    getAsset: (...args: unknown[]) => getAssetMock(...args),
    getAssetVariantUrl: (...args: unknown[]) => getAssetVariantUrlMock(...args),
    uploadAssetFile: (...args: unknown[]) => uploadAssetFileMock(...args),
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
    params: {
      aspect_ratio: "1:1",
      size: "1k",
    },
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
    createWorkbenchGenerationMock.mockResolvedValue(createGeneration({
      id: "generation-created",
      status: "succeeded",
    }));
    getWorkbenchGenerationMock.mockResolvedValue(createGeneration({ status: "succeeded" }));
    retryWorkbenchGenerationMock.mockResolvedValue(createGeneration({
      id: "generation-retry",
      status: "succeeded",
    }));
    getAssetMock.mockImplementation(async (assetId: string) => ({
      id: assetId,
      originalFilename: `${assetId}.png`,
      previewUrl: `https://example.com/${assetId}.png`,
      title: `${assetId}.png`,
    }));
    getAssetVariantUrlMock.mockImplementation(async (assetId: string) => ({
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      method: "GET",
      url: `https://example.com/${assetId}.png`,
      variantKey: "preview",
    }));
    uploadAssetFileMock.mockResolvedValue({
      id: "asset-uploaded-1",
      originalFilename: "ref.png",
      previewUrl: "https://example.com/ref.png",
      title: "ref.png",
    });
  });

  test("renders /workbench under the shared shell", async () => {
    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByText("独立生图工作台")).toBeTruthy();
    expect(screen.getByLabelText("Prompt")).toBeTruthy();
  });

  test("redirects project workbench routes to /workbench", async () => {
    setRoute("/projects/project-1/workbench");
    renderRouter();

    await waitFor(() => {
      expect(window.location.pathname).toBe("/workbench");
    });
  });

  test("shows generation result actions", async () => {
    setRoute("/workbench");
    renderRouter();

    expect(await screen.findByRole("button", { name: "再次生成" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "复用参数" })).toBeTruthy();
  });

  test("uploads a reference image and attaches it to the current draft", async () => {
    setRoute("/workbench");
    const { container } = renderRouter();

    expect(await screen.findByText("添加参考图")).toBeTruthy();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();

    fireEvent.change(input!, {
      target: {
        files: [new File(["ref"], "ref.png", { type: "image/png" })],
      },
    });

    await waitFor(() => {
      expect(uploadAssetFileMock).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("图1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "引用" })).toBeTruthy();
  });

  test("submits only referenced images when prompt contains @图N tags", async () => {
    setRoute("/workbench");
    const { container } = renderRouter();

    expect(await screen.findByText("添加参考图")).toBeTruthy();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();

    uploadAssetFileMock
      .mockResolvedValueOnce({
        id: "11111111-1111-4111-8111-111111111111",
        originalFilename: "ref-1.png",
        previewUrl: "https://example.com/ref-1.png",
        title: "ref-1.png",
      })
      .mockResolvedValueOnce({
        id: "22222222-2222-4222-8222-222222222222",
        originalFilename: "ref-2.png",
        previewUrl: "https://example.com/ref-2.png",
        title: "ref-2.png",
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
      expect((screen.getByRole("button", { name: "开始生成" }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: "开始生成" }));

    await waitFor(() => {
      expect(createWorkbenchGenerationMock).toHaveBeenCalledTimes(1);
    });
    expect(createWorkbenchGenerationMock.mock.calls[0]?.[0]).toMatchObject({
      referenceAssetIds: ["22222222-2222-4222-8222-222222222222"],
    });
  });
});
