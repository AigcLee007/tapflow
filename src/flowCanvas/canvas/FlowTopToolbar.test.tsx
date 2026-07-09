import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { FlowTopToolbar } from "./FlowTopToolbar";

const createWorkspaceProjectMock = vi.fn();
const updateWorkspaceProjectMock = vi.fn();
const deleteWorkspaceProjectMock = vi.fn();
const setProjectTitleMock = vi.fn();

const mockedStoreState: {
  nodes: Array<Record<string, unknown>>;
  projectTitle: string;
  setProjectTitle: typeof setProjectTitleMock;
} = {
  nodes: [],
  projectTitle: "Test Project",
  setProjectTitle: setProjectTitleMock,
};

vi.mock("../store/flowCanvasStore", () => ({
  useFlowCanvasStore: (selector: (state: typeof mockedStoreState) => unknown) => selector(mockedStoreState),
}));

vi.mock("../../workspace/workspaceApi", () => ({
  createWorkspaceProject: (...args: unknown[]) => createWorkspaceProjectMock(...args),
  updateWorkspaceProject: (...args: unknown[]) => updateWorkspaceProjectMock(...args),
  deleteWorkspaceProject: (...args: unknown[]) => deleteWorkspaceProjectMock(...args),
}));

vi.mock("../../services/v2HttpClient", () => ({
  V2_AUTH_CHANGE_EVENT: "v2-auth-change",
  getStoredAccessToken: () => null,
}));

vi.mock("../../billing/billingApi", () => ({
  getBillingSummary: vi.fn(async () => ({
    account: { balanceCents: 0 },
  })),
}));

describe("FlowTopToolbar", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/projects/project-1");
    createWorkspaceProjectMock.mockReset();
    updateWorkspaceProjectMock.mockReset();
    deleteWorkspaceProjectMock.mockReset();
    setProjectTitleMock.mockReset();
    mockedStoreState.projectTitle = "Test Project";
    mockedStoreState.nodes = [];
    mockedStoreState.setProjectTitle = setProjectTitleMock;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ items: [] }),
        ok: true,
      })),
    );
  });

  afterEach(() => {
    cleanup();
    try {
      vi.runOnlyPendingTimers();
    } catch {}
    try {
      vi.useRealTimers();
    } catch {}
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.pushState(null, "", "/");
  });

  test("renders a clear shared brand mark in the canvas chrome", async () => {
    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved to cloud", status: "saved" }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("brand-mark").getAttribute("data-size")).toBe("canvas");
      expect(screen.getByTestId("brand-mark-orb").className).toContain("h-12 w-[72px]");
      expect(screen.getByRole("img", { name: "Aittco" })).toBeTruthy();
      expect(screen.getByRole("img", { name: "Aittco" }).getAttribute("src")).toBe("/logo-2.png");
      expect(screen.getByDisplayValue("Test Project")).toBeTruthy();
    });
  });

  test("does not render a 360 panorama generate button in the top chrome", async () => {
    mockedStoreState.nodes = [
      {
        data: {
          generationPrompt: "city dusk skyline",
          kind: "image",
          title: "Image 1",
        },
        id: "image-1",
        selected: true,
        type: "image",
      },
    ];

    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved", status: "saved" }}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /360 鍏ㄦ櫙鐢熸垚/i })).toBeNull();
    });
  });

  test("opens the canvas logo menu as a fixed body-level surface with the narrow minimal layout and closes it on outside click", async () => {
    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved to cloud", status: "saved" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "鎵撳紑椤圭洰鑿滃崟" }));

    const menu = screen.getByRole("menu", { name: "椤圭洰鑿滃崟" });
    expect(menu).toBeTruthy();
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.left).toBe("20px");
    expect(menu.style.top).toBe("112px");
    expect(menu.style.width).toBe("288px");
    expect(menu.style.zIndex).toBe("2400");
    expect(screen.getByRole("menuitem", { name: "杩斿洖宸ヤ綔绌洪棿" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "閲嶅懡鍚嶉」鐩?" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "鏂板缓椤圭洰" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "鍒犻櫎椤圭洰" })).toBeTruthy();
    expect(screen.getAllByRole("menuitem")[1]?.className).toContain("min-h-[60px]");
    expect(screen.queryByTestId("project-menu-create-icon")).toBeNull();
    expect(screen.queryByTestId("project-menu-delete-icon")).toBeNull();

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryAllByRole("menu")).toHaveLength(0);
    });
  });

  test("closes the project menu when the notifications menu opens", async () => {
    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved to cloud", status: "saved" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "鎵撳紑椤圭洰鑿滃崟" }));
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "閫氱煡" }));

    await waitFor(() => {
      expect(screen.queryAllByRole("menu")).toHaveLength(1);
    });
    expect(screen.getByText("鍏ㄩ儴宸茶")).toBeTruthy();
  });

  test("hides the top-right credits and notification actions when utility actions are disabled", async () => {
    render(
      <FlowTopToolbar
        cullingEnabled
        hideUtilityActions
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved to cloud", status: "saved" }}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "閫氱煡" })).toBeNull();
    });

    expect(screen.getByRole("button", { name: "鎵撳紑椤圭洰鑿滃崟" })).toBeTruthy();
    expect(screen.getByDisplayValue("Test Project")).toBeTruthy();
  });

  test("opens a custom dark confirmation sheet before deleting a project", async () => {
    deleteWorkspaceProjectMock.mockResolvedValue(undefined);
    vi.useFakeTimers();

    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved to cloud", status: "saved" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "鎵撳紑椤圭洰鑿滃崟" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "鍒犻櫎椤圭洰" }));

    expect(screen.getByRole("dialog", { name: "鍒犻櫎褰撳墠椤圭洰" })).toBeTruthy();
    expect(deleteWorkspaceProjectMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "椤圭洰鑿滃崟" })).toBeNull();

    await act(async () => {
      vi.runOnlyPendingTimers();
    });
  });

  test("closes the delete confirmation sheet on cancel and confirms deletion explicitly", async () => {
    deleteWorkspaceProjectMock.mockResolvedValue(undefined);

    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved to cloud", status: "saved" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "鎵撳紑椤圭洰鑿滃崟" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "鍒犻櫎椤圭洰" }));

    fireEvent.click(screen.getByRole("button", { name: "鍙栨秷" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "鍒犻櫎褰撳墠椤圭洰" })).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "鎵撳紑椤圭洰鑿滃崟" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "鍒犻櫎椤圭洰" }));
    fireEvent.click(screen.getByRole("button", { name: "鍒犻櫎" }));

    await waitFor(() => {
      expect(deleteWorkspaceProjectMock).toHaveBeenCalledWith("project-1");
    });
  });
});
