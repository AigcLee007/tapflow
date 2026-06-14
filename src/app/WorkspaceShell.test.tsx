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
  test("renders primary creator navigation", () => {
    renderShell();

    expect(screen.getByRole("button", { name: "AI Flow 测试工作区" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "主页" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "工作空间" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "素材库" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "价格方案" }).length).toBeGreaterThan(0);
  });

  test("logo click navigates to home without opening a menu", () => {
    window.history.replaceState(null, "", "/workspace");

    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "AI Flow 测试工作区" }));

    expect(window.location.pathname).toBe("/home");
    expect(screen.queryByRole("menu", { name: "项目菜单" })).toBeNull();
  });

  test("opens the account menu separately", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "测试用户 test@example.com 打开账户菜单" }));

    expect(screen.getAllByText("test@example.com").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "账户管理" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
  });
});
