import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { WorkspaceShell } from "./WorkspaceShell";

function createAuthState(overrides: Partial<AuthState> = {}): AuthState {
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
    tenant: {
      id: "tenant-1",
      name: "测试 的工作区",
      plan: "free",
      slug: "test",
      status: "active",
    },
    user: {
      displayName: "测试",
      email: "lb20060807@126.com",
      id: "user-1",
      status: "active",
    },
    ...overrides,
  };
}

function renderShell(authState = createAuthState()) {
  return render(
    <AuthContext.Provider value={authState}>
      <WorkspaceShell>
        <div>Shell child</div>
      </WorkspaceShell>
    </AuthContext.Provider>,
  );
}

describe("WorkspaceShell", () => {
  test("renders TapNow-style creator navigation and hides account from primary nav", () => {
    renderShell();

    expect(screen.getByRole("button", { name: "AI Flow 测试 的工作区" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "主页" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "工作空间" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "素材库" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "价格方案" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "账号" })).toBeNull();
  });

  test("opens an account menu with profile and logout actions", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "测试 lb20060807@126.com 打开账户菜单" }));

    expect(screen.getAllByText("lb20060807@126.com").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "账户管理" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
  });

  test("clicking workspace navigation dispatches a projects reveal event", () => {
    const listener = vi.fn();
    window.addEventListener("workspace:show-projects", listener);
    window.history.replaceState(null, "", "/workspace");

    try {
      renderShell();

      fireEvent.click(screen.getAllByRole("button", { name: "工作空间" })[0]);

      expect(window.location.pathname).toBe("/workspace");
      expect(window.location.hash).toBe("#projects");
      expect(listener).toHaveBeenCalled();
    } finally {
      window.removeEventListener("workspace:show-projects", listener);
    }
  });
});
