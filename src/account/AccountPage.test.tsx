import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { AccountPage } from "./AccountPage";

function createAuthState(): AuthState {
  return {
    authenticated: true,
    error: null,
    loading: false,
    permissions: ["admin:system"],
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
  };
}

describe("AccountPage", () => {
  test("renders account management details in the TapNow-style shell language", () => {
    render(
      <AuthContext.Provider value={createAuthState()}>
        <AccountPage />
      </AuthContext.Provider>,
    );

    expect(screen.getByRole("heading", { name: "账户管理" })).toBeTruthy();
    expect(screen.getByText("管理你的个人资料、会员权益、积分额度和创作设置。")).toBeTruthy();
    expect(screen.getByText("个人资料")).toBeTruthy();
    expect(screen.getByText("会员权益")).toBeTruthy();
    expect(screen.getByRole("button", { name: "运营后台" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "模型中心" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Provider Connections" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
  });

  test("shows creator account details without internal tenant diagnostics", () => {
    render(
      <AuthContext.Provider
        value={{
          ...createAuthState(),
          permissions: ["project:read"],
          roles: ["tenant_owner"],
          tenant: {
            id: "tenant-1",
            name: "Lee's Workspace",
            plan: "free",
            slug: "lee-workspace",
            status: "active",
          },
          user: {
            displayName: "Lee",
            email: "lee@example.com",
            id: "user-1",
            status: "active",
          },
        }}
      >
        <AccountPage />
      </AuthContext.Provider>,
    );

    expect(screen.getByText("lee@example.com")).toBeTruthy();
    expect(screen.getByText("普通用户")).toBeTruthy();
    expect(screen.queryByText("tenant-1")).toBeNull();
    expect(screen.queryByText("user-1")).toBeNull();
    expect(screen.queryByText("lee-workspace")).toBeNull();
    expect(screen.queryByText("tenant_owner")).toBeNull();
    expect(screen.queryByText("project:read")).toBeNull();
  });
});
