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
    expect(screen.getByText("管理你的个人资料、工作区身份和模型连接入口。")).toBeTruthy();
    expect(screen.getByText("当前身份")).toBeTruthy();
    expect(screen.getByText("工作区信息")).toBeTruthy();
    expect(screen.getByRole("button", { name: "模型中心" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Provider Connections" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
  });
});
