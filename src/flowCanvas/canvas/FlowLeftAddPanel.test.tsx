import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../../auth/useAuth";
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

describe("FlowLeftAddPanel", () => {
  test("renders readable Phase 3 dock menu copy", async () => {
    render(
      <AuthContext.Provider value={createAuthState()}>
        <FlowLeftAddPanel />
      </AuthContext.Provider>,
    );

    fireEvent.mouseEnter(screen.getByTitle("添加节点"));

    expect(await screen.findByText("添加节点")).toBeTruthy();
    expect(screen.getByText("文本")).toBeTruthy();
    expect(screen.getByText("脚本、提示词和文案")).toBeTruthy();
    expect(screen.getByText("图片")).toBeTruthy();
    expect(screen.getByText("视频")).toBeTruthy();
    expect(screen.getByText("音频")).toBeTruthy();
    expect(screen.getByText("资源")).toBeTruthy();
  });
});
