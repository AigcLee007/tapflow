import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AuthAttemptResult, VerificationRequired } from "../services/v2AuthClient";
import { V2HttpError } from "../services/v2HttpClient";
import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";
import { AuthContext, type AuthState } from "./useAuth";

const authenticatedResult: AuthAttemptResult = {
  session: {
    currentTenant: {
      id: "tenant-1",
      name: "Creator Workspace",
      plan: "free",
      slug: "creator-workspace",
      status: "active",
    },
    permissions: [],
    roles: ["tenant_owner"],
    sessionId: "session-1",
    user: {
      displayName: "Creator",
      email: "creator@example.com",
      id: "user-1",
      status: "active",
    },
  },
  status: "authenticated",
};

const registrationChallenge: VerificationRequired = {
  challengeToken: "registration-challenge-token",
  emailMasked: "c***@example.com",
  expiresInSeconds: 600,
  reason: "email_unverified",
  resendAvailableInSeconds: 60,
  status: "verification_required",
};

const loginChallenge: VerificationRequired = {
  challengeToken: "login-challenge-token",
  emailMasked: "a***@example.com",
  expiresInSeconds: 600,
  reason: "new_device",
  resendAvailableInSeconds: 60,
  status: "verification_required",
};

function createAuthState(overrides: Partial<AuthState> = {}): AuthState {
  return {
    authenticated: false,
    error: null,
    loading: false,
    login: vi.fn(async () => authenticatedResult),
    logout: vi.fn(async () => undefined),
    permissions: [],
    refreshMe: vi.fn(async () => undefined),
    register: vi.fn(async () => authenticatedResult),
    resendEmailVerification: vi.fn(async () => registrationChallenge),
    roles: [],
    sessionId: null,
    tenant: null,
    user: null,
    verifyEmail: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderWithAuth(ui: React.ReactElement, authState = createAuthState()) {
  return render(<AuthContext.Provider value={authState}>{ui}</AuthContext.Provider>);
}

describe("auth pages", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("renders the immersive product login page with compact first-screen layout and submits v2 login fields", async () => {
    const login = vi.fn(async () => authenticatedResult);
    renderWithAuth(<LoginPage />, createAuthState({ login }));

    expect(screen.getByRole("heading", { name: "登录 TapFlow" })).toBeTruthy();
    expect(screen.getByTestId("auth-shell").className).toContain("overflow-hidden");
    expect(screen.getByTestId("auth-shell").className).toContain("max-w-[1280px]");
    expect(screen.getByTestId("auth-shell-grid").className).toContain("gap-4");
    expect(screen.getByTestId("auth-shell-grid").className).toContain("lg:grid-cols-[1.02fr_380px]");
    expect(screen.getByRole("heading", { name: "登录 TapFlow" }).className).toContain("text-[30px]");
    expect(screen.getByText("云端项目")).toBeTruthy();
    expect(screen.getAllByText("AI 工作流").length).toBeGreaterThan(0);
    expect(screen.getAllByText("素材资产库").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "creator@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret-pass" },
    });
    expect(screen.queryByText("租户 ID")).toBeNull();
    expect(screen.queryByLabelText(/tenant/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "进入工作区" }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        email: "creator@example.com",
        password: "secret-pass",
      });
    });
  });

  test("does not ask creators for a tenant id on login", () => {
    renderWithAuth(<LoginPage />);

    expect(screen.getByLabelText("邮箱")).toBeTruthy();
    expect(screen.getByLabelText("密码")).toBeTruthy();
    expect(screen.queryByText("租户 ID")).toBeNull();
    expect(screen.queryByLabelText(/tenant/i)).toBeNull();
  });

  test("keeps register actions inside the same compact auth shell and switches back to login", () => {
    renderWithAuth(<RegisterPage />);

    expect(screen.getByRole("heading", { name: "创建 TapFlow 账号" })).toBeTruthy();
    expect(screen.getByText("创建你的专属工作区，开始沉淀可复用的 AI 创作流程。")).toBeTruthy();
    expect(screen.getByTestId("auth-shell").className).toContain("max-w-[1280px]");
    expect(screen.getByTestId("auth-shell-grid").className).toContain("lg:grid-cols-[1.02fr_380px]");
    expect(screen.getByLabelText("显示名称")).toBeTruthy();
    expect(screen.getByLabelText("工作区名称")).toBeTruthy();
    expect(screen.getByRole("button", { name: "创建账号" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "返回登录" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "返回登录" }));

    expect(window.location.pathname).toBe("/login");
  });

  test("keeps registration on the page while email verification is required", async () => {
    window.history.replaceState(null, "", "/register");
    const register = vi.fn(async () => registrationChallenge);
    renderWithAuth(<RegisterPage />, createAuthState({ register }));

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "creator@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "StrongPass123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));

    expect(await screen.findByRole("heading", { name: "验证邮箱" })).toBeTruthy();
    expect(screen.getByText("c***@example.com")).toBeTruthy();
    expect(window.location.pathname).toBe("/register");

    fireEvent.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.getByRole("heading", { name: "创建 TapFlow 账号" })).toBeTruthy();
    expect(window.location.pathname).toBe("/register");
  });

  test("switches new-device login to the shared verification step", async () => {
    window.history.replaceState(null, "", "/login");
    const login = vi.fn(async () => loginChallenge);
    renderWithAuth(<LoginPage />, createAuthState({ login }));

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "StrongPass123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "进入工作区" }));

    expect(await screen.findByRole("heading", { name: "验证邮箱" })).toBeTruthy();
    expect(screen.getByText("a***@example.com")).toBeTruthy();
    expect(window.location.pathname).toBe("/login");
  });

  test("submits a six-digit code and navigates only after verification resolves", async () => {
    window.history.replaceState(null, "", "/register");
    let resolveVerification: (() => void) | undefined;
    const verifyEmail = vi.fn(() => new Promise<void>((resolve) => {
      resolveVerification = resolve;
    }));
    renderWithAuth(
      <RegisterPage />,
      createAuthState({
        register: vi.fn(async () => registrationChallenge),
        verifyEmail,
      }),
    );

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "creator@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "StrongPass123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));

    const codeInput = await screen.findByLabelText("6 位验证码");
    expect(codeInput.getAttribute("inputmode")).toBe("numeric");
    expect(codeInput.getAttribute("autocomplete")).toBe("one-time-code");
    expect(codeInput.getAttribute("maxlength")).toBe("6");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "确认验证码" }));

    await waitFor(() => {
      expect(verifyEmail).toHaveBeenCalledWith({
        challengeToken: "registration-challenge-token",
        code: "123456",
      });
    });
    expect(window.location.pathname).toBe("/register");

    await act(async () => {
      resolveVerification?.();
    });
    expect(window.location.pathname).toBe("/workspace");
  });

  test("clears and refocuses the code after an invalid verification response", async () => {
    window.history.replaceState(null, "", "/login");
    const verifyEmail = vi.fn(async () => {
      throw new V2HttpError({
        code: "VERIFICATION_INVALID",
        message: "验证码不正确",
        status: 400,
      });
    });
    renderWithAuth(
      <LoginPage />,
      createAuthState({
        login: vi.fn(async () => loginChallenge),
        verifyEmail,
      }),
    );

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "StrongPass123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "进入工作区" }));

    const codeInput = await screen.findByLabelText("6 位验证码");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "确认验证码" }));

    expect(await screen.findByText("验证码不正确")).toBeTruthy();
    await waitFor(() => {
      expect((codeInput as HTMLInputElement).value).toBe("");
      expect(document.activeElement).toBe(codeInput);
    });
    expect(window.location.pathname).toBe("/login");
  });

  test("enables resend after 60 seconds and restarts timing from the replacement challenge", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/login");
    const replacementChallenge: VerificationRequired = {
      ...loginChallenge,
      challengeToken: "replacement-challenge-token",
      resendAvailableInSeconds: 30,
    };
    const resendEmailVerification = vi.fn(async () => replacementChallenge);
    renderWithAuth(
      <LoginPage />,
      createAuthState({
        login: vi.fn(async () => loginChallenge),
        resendEmailVerification,
      }),
    );

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "StrongPass123!" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "进入工作区" }));
      await Promise.resolve();
    });

    const countdownButton = screen.getByRole("button", { name: "重新发送（60 秒）" });
    expect((countdownButton as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    const resendButton = screen.getByRole("button", { name: "重新发送" });
    expect((resendButton as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      fireEvent.click(resendButton);
      await Promise.resolve();
    });

    expect(resendEmailVerification).toHaveBeenCalledWith({
      challengeToken: "login-challenge-token",
    });
    expect(
      (screen.getByRole("button", { name: "重新发送（30 秒）" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  test("handles resend rejection and restores the enabled state", async () => {
    window.history.replaceState(null, "", "/login");
    const readyChallenge = { ...loginChallenge, resendAvailableInSeconds: 0 };
    let rejectResend: ((reason: Error) => void) | undefined;
    const resendEmailVerification = vi.fn(() => new Promise<VerificationRequired>((_resolve, reject) => {
      rejectResend = reject;
    }));
    renderWithAuth(
      <LoginPage />,
      createAuthState({
        login: vi.fn(async () => readyChallenge),
        resendEmailVerification,
      }),
    );

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "StrongPass123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "进入工作区" }));

    const resendButton = await screen.findByRole("button", { name: "重新发送" });
    fireEvent.click(resendButton);
    await waitFor(() => expect(resendEmailVerification).toHaveBeenCalledOnce());
    expect((resendButton as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      rejectResend?.(new Error("验证码发送失败，请重试"));
    });

    expect(await screen.findByText("验证码发送失败，请重试")).toBeTruthy();
    expect((resendButton as HTMLButtonElement).disabled).toBe(false);
  });
});
