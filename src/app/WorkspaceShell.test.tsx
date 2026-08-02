import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { WorkspaceShell } from "./WorkspaceShell";

const getBillingSummaryMock = vi.fn();

vi.mock("../billing/billingApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../billing/billingApi")>();
  return {
    ...actual,
    getBillingSummary: () => getBillingSummaryMock(),
  };
});

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
  beforeEach(() => {
    window.localStorage.setItem("v2-access-token", "access-token");
    getBillingSummaryMock.mockResolvedValue({
      availableCredits: 3100,
      balanceCredits: 3100,
      expiringSoonCredits: 0,
      nearestExpiryAt: null,
      reservedCredits: 0,
      walletId: "wallet-1",
    });
  });

  test("renders primary creator navigation", () => {
    const { container } = renderShell();

    expect(screen.getByRole("button", { name: "返回首页" })).toBeTruthy();
    expect(screen.queryByText("AI Flow")).toBeNull();
    expect(screen.queryByText("测试工作区")).toBeNull();
    const desktopNav = container.querySelector("header nav.hidden");
    expect(desktopNav).toBeTruthy();
    expect(within(desktopNav as HTMLElement).getAllByRole("button").every((button) => button.className.includes("whitespace-nowrap"))).toBe(true);
    expect(within(desktopNav as HTMLElement).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "主页",
      "无限画布",
      "生图工作台",
      "提示词广场",
      "素材库",
      "账单充值",
    ]);
    expect(screen.queryByRole("button", { name: /^工作台$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^工作空间$/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /素材库/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /账单充值/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /价格方案/ })).toBeNull();
  });

  test("renders the shared brand mark instead of the legacy cyan square icon", () => {
    renderShell();
    expect(screen.getByTestId("brand-mark").getAttribute("data-size")).toBe("header");
    expect(screen.getByTestId("brand-mark-orb").className).toContain("h-20 w-[120px]");
    expect(screen.getByRole("img", { name: "Aittco" }).getAttribute("src")).toBe("/logo-2.png");
    expect(screen.queryByText("Workflow")).toBeNull();
  });

  test("logo click navigates to home without opening a menu", () => {
    window.history.replaceState(null, "", "/workspace");

    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "返回首页" }));

    expect(window.location.pathname).toBe("/home");
    expect(screen.queryByRole("menu", { name: /项目菜单/ })).toBeNull();
  });

  test("renders a compact account trigger with only the initial and chevron visible", () => {
    renderShell();

    const accountTrigger = screen.getByRole("button", { name: /打开账户菜单/ });
    expect(within(accountTrigger).getByText("测")).toBeTruthy();
    expect(within(accountTrigger).queryByText("测试用户")).toBeNull();
    expect(within(accountTrigger).queryByText("test@example.com")).toBeNull();
  });

  test("opens the account menu separately", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: /打开账户菜单/ }));

    expect(screen.getAllByText("test@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button").some((button) => button.className.includes("h-[38px]"))).toBe(true);
    expect(screen.getByRole("button", { name: "账户管理" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /退出登录/ })).toBeTruthy();
  });

  test("closes the account menu when clicking blank space", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /打开账户菜单/ }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("button", { name: "账户管理" })).toBeNull();
  });

  test("hides model connection entry for creators and syncs billing state", async () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: /test@example.com/ }));

    expect(screen.queryByRole("button", { name: /Provider|Model/ })).toBeNull();
    expect(await screen.findByText("3,100")).toBeTruthy();
    expect(await screen.findByText("个人钱包")).toBeTruthy();
    expect(screen.queryByText(/Standard|Gold|Platinum/i)).toBeNull();
  });

  test("shows an unavailable balance instead of zero when the wallet request fails", async () => {
    getBillingSummaryMock.mockRejectedValueOnce(new Error("wallet unavailable"));
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /test@example.com/ }));

    expect(await screen.findByText("--")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  test("shows operations console for admins", () => {
    renderShell(createAuthState({
      permissions: ["admin:system"],
      roles: ["tenant_admin"],
    }));

    fireEvent.click(screen.getByRole("button", { name: /test@example.com/ }));

    expect(screen.getByRole("button", { name: /Admin|Operations/i })).toBeTruthy();
  });

});
