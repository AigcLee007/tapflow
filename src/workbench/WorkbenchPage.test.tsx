import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AppRouter } from "../app/AppRouter";
import { AuthContext, type AuthState } from "../auth/useAuth";

const useImageModelCatalogMock = vi.fn();
const listAiModelRoutesMock = vi.fn();
const listWorkbenchGenerationsMock = vi.fn();
const createWorkbenchGenerationMock = vi.fn();
const getWorkbenchGenerationMock = vi.fn();
const retryWorkbenchGenerationMock = vi.fn();

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

function setRoute(pathname: string) {
  window.history.replaceState(null, "", pathname);
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
      name: "测试工作区",
      plan: "free",
      slug: "test",
      status: "active",
    },
    user: {
      displayName: "测试用户",
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
      generations: [
        {
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
          prompt: "产品海报，干净背景",
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
        },
      ],
      nextCursor: null,
    });

    createWorkbenchGenerationMock.mockResolvedValue(undefined);
    getWorkbenchGenerationMock.mockResolvedValue(undefined);
    retryWorkbenchGenerationMock.mockResolvedValue(undefined);
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

    expect(await screen.findByLabelText("再次生成")).toBeTruthy();
    expect(screen.getByLabelText("复用参数")).toBeTruthy();
  });
});
