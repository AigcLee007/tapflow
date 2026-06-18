import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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
    getBillingSummaryMock.mockResolvedValue({
      account: {
        balanceCents: 120,
        createdAt: "2026-06-18T00:00:00.000Z",
        currency: "credits",
        id: "billing-1",
        reservedCents: 0,
        status: "active",
        tenantId: "tenant-1",
        updatedAt: "2026-06-18T00:00:00.000Z",
      },
      creditGrants: {
        availableCredits: 120,
        expiringSoonCredits: 0,
        lifetimeCredits: 120,
        reservedCredits: 0,
      },
      ledgerTotals: { refundCents: 0, reserveCents: 0, settleCents: 0 },
      membership: { discountMultiplier: 0.9, tier: "gold" },
      usageTotals: {
        eventCount: 0,
        pendingCount: 0,
        rawCostTotal: "0",
        settledCount: 0,
        totalBillableCents: 0,
      },
    });
  });

  test("renders primary creator navigation", () => {
    renderShell();

    expect(screen.getByRole("button", { name: /AI Flow/i })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /主页/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /工作空间/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /素材库/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /价格方案/ }).length).toBeGreaterThan(0);
  });

  test("renders the shared brand mark instead of the legacy cyan square icon", () => {
    renderShell();
    expect(screen.getByTestId("brand-mark")).toBeTruthy();
    expect(screen.queryByText("Workflow")).toBeNull();
  });

  test("logo click navigates to home without opening a menu", () => {
    window.history.replaceState(null, "", "/workspace");

    renderShell();

    fireEvent.click(screen.getByRole("button", { name: /AI Flow/i }));

    expect(window.location.pathname).toBe("/home");
    expect(screen.queryByRole("menu", { name: /项目菜单/ })).toBeNull();
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
    expect(await screen.findByText("120")).toBeTruthy();
    expect(await screen.findByText(/Gold/i)).toBeTruthy();
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
