import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AppRouter } from "../../app/AppRouter";

const useRemoteFlowProjectMock = vi.fn();
const useRemoteFlowAutosaveMock = vi.fn();
const useImageModelCatalogMock = vi.fn();
const listAiModelRoutesMock = vi.fn();

let coarsePointer = false;

vi.mock("../../auth/AuthGate", () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../FlowCanvasPage", () => ({
  default: () => <div data-testid="canvas-mode">Canvas Mode</div>,
}));

vi.mock("../hooks/useRemoteFlowProject", () => ({
  useRemoteFlowProject: () => useRemoteFlowProjectMock(),
}));

vi.mock("../hooks/useRemoteFlowAutosave", () => ({
  useRemoteFlowAutosave: () => useRemoteFlowAutosaveMock(),
}));

vi.mock("../runtime/remoteDraftSaveBarrier", () => ({
  registerRemoteDraftSaveBarrier: vi.fn(),
}));

vi.mock("../../hooks/useImageModelCatalog", () => ({
  useImageModelCatalog: () => useImageModelCatalogMock(),
}));

vi.mock("../../services/v2AiModelCatalogApi", async () => {
  const actual = await vi.importActual("../../services/v2AiModelCatalogApi");
  return {
    ...actual,
    listAiModelRoutes: (...args: unknown[]) => listAiModelRoutesMock(...args),
  };
});

function setRoute(pathname: string) {
  window.history.replaceState(null, "", pathname);
}

describe("ImageWorkbenchPage routing and controls", () => {
  beforeEach(() => {
    coarsePointer = false;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
      writable: true,
    });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query.includes("pointer: coarse") ? coarsePointer : false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    useRemoteFlowProjectMock.mockReturnValue({
      draft: {
        flowId: "flow-1",
        graph: { edges: [], nodes: [], viewport: { x: 0, y: 0, zoom: 1 } },
        id: "draft-1",
        projectId: "project-1",
        revision: 1,
        tenantId: "tenant-1",
        updatedAt: new Date().toISOString(),
      },
      error: null,
      flow: { currentVersionId: null, id: "flow-1" },
      loading: false,
      project: { id: "project-1", name: "Mobile Project" },
      reload: vi.fn(),
    });
    useRemoteFlowAutosaveMock.mockReturnValue({
      error: null,
      saveNow: vi.fn(async () => undefined),
      status: "saved",
      updatedAt: new Date().toISOString(),
    });
    useImageModelCatalogMock.mockReturnValue({
      error: null,
      loading: false,
      models: [
        {
          defaultSize: "1k",
          extraAspectRatios: ["21:9"],
          id: "pixellelabs.nano-banana-pro",
          label: "Nano Banana Pro",
          modelFamily: "pixellelabs.nano-banana-pro",
          routeFamily: "pixellelabs.nano-banana-pro",
          sizeOptions: ["1k", "2k", "4k"],
        },
        {
          defaultSize: "1k",
          extraAspectRatios: [],
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
        estimatedCredits: 4,
        minChargeCredits: 4,
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
  });

  test("renders workbench for explicit workbench project route", async () => {
    setRoute("/projects/project-1/workbench");

    render(<AppRouter />);

    expect(await screen.findByTestId("image-workbench-page")).toBeTruthy();
  });

  test("renders canvas for explicit canvas project route", async () => {
    setRoute("/projects/project-1/canvas");

    render(<AppRouter />);

    expect(await screen.findByTestId("canvas-mode")).toBeTruthy();
  });

  test("redirects legacy mobile project routes to workbench", async () => {
    coarsePointer = true;
    setRoute("/projects/project-1");

    render(<AppRouter />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects/project-1/workbench");
    });
  });

  test("redirects legacy desktop project routes to canvas", async () => {
    setRoute("/projects/project-1");

    render(<AppRouter />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects/project-1/canvas");
    });
  });

  test("composer exposes core generation controls", async () => {
    setRoute("/projects/project-1/workbench");

    render(<AppRouter />);

    expect(await screen.findByLabelText("Prompt")).toBeTruthy();
    expect(screen.getByLabelText("Model")).toBeTruthy();
    expect(screen.getByLabelText("Route")).toBeTruthy();
    expect(screen.getByLabelText("Aspect ratio")).toBeTruthy();
    expect(screen.getByLabelText("Size")).toBeTruthy();
    expect(screen.getByLabelText("Quantity")).toBeTruthy();
    expect(screen.getByText("Advanced")).toBeTruthy();
  });
});
