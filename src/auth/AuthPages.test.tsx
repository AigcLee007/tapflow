import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "./useAuth";
import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";

function createAuthState(overrides: Partial<AuthState> = {}): AuthState {
  return {
    authenticated: false,
    error: null,
    loading: false,
    permissions: [],
    refreshMe: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    roles: [],
    sessionId: null,
    tenant: null,
    user: null,
    ...overrides,
  };
}

function renderWithAuth(ui: React.ReactElement, authState = createAuthState()) {
  return render(<AuthContext.Provider value={authState}>{ui}</AuthContext.Provider>);
}

describe("auth pages", () => {
  test("renders the immersive product login page and submits v2 login fields", async () => {
    const login = vi.fn(async () => undefined);
    renderWithAuth(<LoginPage />, createAuthState({ login }));

    expect(screen.getByRole("heading", { name: "登录 TapFlow" })).toBeTruthy();
    expect(screen.getByText("把灵感、素材和 AI 模型组织成一张可执行的创作流程。")).toBeTruthy();
    expect(screen.getByText("云端项目")).toBeTruthy();
    expect(screen.getAllByText("AI 工作流").length).toBeGreaterThan(0);
    expect(screen.getAllByText("素材资产库").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "creator@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret-pass" },
    });
    fireEvent.change(screen.getByLabelText("租户 ID"), {
      target: { value: "tenant-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "进入工作区" }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        email: "creator@example.com",
        password: "secret-pass",
        tenantId: "tenant-1",
      });
    });
  });

  test("renders matching register page copy and switches back to login", () => {
    renderWithAuth(<RegisterPage />);

    expect(screen.getByRole("heading", { name: "创建 TapFlow 账号" })).toBeTruthy();
    expect(screen.getByText("创建你的专属工作区，开始沉淀可复用的 AI 创作流程。")).toBeTruthy();
    expect(screen.getByLabelText("显示名称")).toBeTruthy();
    expect(screen.getByLabelText("工作区名称")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "返回登录" }));

    expect(window.location.pathname).toBe("/login");
  });
});
