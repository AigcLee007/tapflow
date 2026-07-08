import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../../auth/useAuth";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { OPEN_PRODUCTION_STUDIO_EVENT } from "../studios/productionStudioEvents";
import { FlowLeftAddPanel } from "./FlowLeftAddPanel";

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    screenToFlowPosition: (position: { x: number; y: number }) => position,
  }),
}));

function createAuthState(): AuthState {
  return {
    authenticated: true,
    error: null,
    loading: false,
    permissions: [],
    refreshMe: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    roles: ["tenant_owner"],
    sessionId: "session-1",
    tenant: { id: "tenant-1", name: "测试工作区", plan: "free", slug: "test", status: "active" },
    user: { displayName: "测试用户", email: "user@example.com", id: "user-1", status: "active" },
  };
}

function renderPanel() {
  return render(
    <AuthContext.Provider value={createAuthState()}>
      <FlowLeftAddPanel />
    </AuthContext.Provider>,
  );
}

describe("FlowLeftAddPanel", () => {
  test("renders readable dock menu copy", async () => {
    renderPanel();

    fireEvent.mouseEnter(screen.getByTitle("添加节点"));

    expect(await screen.findByText("添加节点")).toBeTruthy();
    expect(screen.getByText("文本")).toBeTruthy();
    expect(screen.getByText("脚本、提示词和文案")).toBeTruthy();
    expect(screen.getByText("图片")).toBeTruthy();
    expect(screen.getByText("视频")).toBeTruthy();
    expect(screen.getByText("音频")).toBeTruthy();
    expect(screen.getByText("工具")).toBeTruthy();
    expect(screen.getByText("资源")).toBeTruthy();
  });

  test("closes the add flyout when the user menu opens", async () => {
    renderPanel();

    fireEvent.mouseEnter(screen.getByTitle("添加节点"));
    expect(await screen.findByText("添加节点")).toBeTruthy();

    fireEvent.click(screen.getByTitle("用户"));

    expect(screen.queryByText("添加节点")).toBeNull();
    expect(screen.getByText("user@example.com")).toBeTruthy();
  });

  test("opens the project director desk as a tool without creating a canvas node", async () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_PRODUCTION_STUDIO_EVENT, listener);
    useFlowCanvasStore.getState().newProject();

    renderPanel();

    fireEvent.mouseEnter(screen.getByTitle("添加节点"));
    fireEvent.click(await screen.findByRole("button", { name: /3D导演台/ }));

    expect(useFlowCanvasStore.getState().nodes).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      scope: "project",
      studio: "director3d",
    });
    window.removeEventListener(OPEN_PRODUCTION_STUDIO_EVENT, listener);
  });

  test("keeps storyboard and video editor entries as enabled node actions", async () => {
    renderPanel();

    fireEvent.mouseEnter(screen.getByTitle("添加节点"));

    expect(await screen.findByText("故事板")).toBeTruthy();
    expect((screen.getByRole("button", { name: /故事板/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /剪辑工程/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
