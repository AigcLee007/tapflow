import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { FlowTopToolbar } from "./FlowTopToolbar";

const createWorkspaceProjectMock = vi.fn();
const updateWorkspaceProjectMock = vi.fn();
const deleteWorkspaceProjectMock = vi.fn();

vi.mock("../store/flowCanvasStore", () => ({
  useFlowCanvasStore: (
    selector: (state: { projectTitle: string; setProjectTitle: ReturnType<typeof vi.fn> }) => unknown,
  ) =>
    selector({
      projectTitle: "测试项目",
      setProjectTitle: vi.fn(),
    }),
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
    createWorkspaceProjectMock.mockReset();
    updateWorkspaceProjectMock.mockReset();
    deleteWorkspaceProjectMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ items: [] }),
        ok: true,
      })),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("renders a clear shared brand mark in the canvas chrome", async () => {
    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "已保存到云端", status: "saved" }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("brand-mark").getAttribute("data-size")).toBe("canvas");
      expect(screen.getByRole("img", { name: "Aittco" })).toBeTruthy();
      expect(screen.getByDisplayValue("测试项目")).toBeTruthy();
    });
  });

  test("opens the canvas logo menu as a fixed body-level surface and closes it on outside click", async () => {
    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "已保存到云端", status: "saved" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开项目菜单" }));

    const menu = screen.getByRole("menu");
    expect(menu).toBeTruthy();
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.left).toBe("20px");
    expect(menu.style.top).toBe("112px");
    expect(menu.style.width).toBe("320px");
    expect(menu.style.zIndex).toBe("2400");
    expect(screen.getByRole("menu", { name: "项目菜单" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "返回工作空间" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "重命名项目" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "新建项目" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "删除项目" })).toBeTruthy();
    expect(screen.getAllByRole("menuitem")[1]?.className).toContain("min-h-[64px]");

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
        saveStatus={{ label: "已保存到云端", status: "saved" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开项目菜单" }));
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "通知" }));

    await waitFor(() => {
      expect(screen.queryAllByRole("menu")).toHaveLength(1);
    });
    expect(screen.getByText("全部已读")).toBeTruthy();
  });
});
