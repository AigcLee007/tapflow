import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AppRouter } from "../../app/AppRouter";

const useRemoteFlowProjectMock = vi.fn();

vi.mock("../../auth/AuthGate", () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../FlowCanvasPage", () => ({
  default: () => <div data-testid="canvas-mode">Canvas Mode</div>,
}));

vi.mock("../hooks/useRemoteFlowProject", () => ({
  useRemoteFlowProject: () => useRemoteFlowProjectMock(),
}));

function setRoute(pathname: string) {
  window.history.replaceState(null, "", pathname);
}

describe("Project workbench compatibility routing", () => {
  beforeEach(() => {
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
      project: { id: "project-1", name: "Project 1" },
      reload: vi.fn(),
    });
  });

  test("redirects explicit project workbench routes to /workbench", async () => {
    setRoute("/projects/project-1/workbench");

    render(<AppRouter />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/workbench");
    });
  });

  test("keeps explicit canvas project routes on canvas", async () => {
    setRoute("/projects/project-1/canvas");

    render(<AppRouter />);

    expect(await screen.findByTestId("canvas-mode")).toBeTruthy();
  });

  test("redirects legacy project routes to canvas", async () => {
    setRoute("/projects/project-1");

    render(<AppRouter />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects/project-1/canvas");
    });
  });
});
