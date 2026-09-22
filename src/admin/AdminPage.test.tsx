import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { AdminPage, getAdminUserDetailState, sumAvailableWalletCredits } from "./AdminPage";
import * as adminApi from "./adminApi";
import { platformAuth } from "../test/platformAuth";
import {
  BILLING_SUMMARY_INVALIDATE_EVENT,
  invalidateBillingSummary,
} from "../billing/useBillingSummarySnapshot";

vi.mock("./adminApi");

function createUser(id: string, credits: number): adminApi.AdminUser {
  return {
    createdAt: "2026-09-01T00:00:00Z", displayName: id, email: `${id}@example.com`,
    emailVerifiedAt: null, id, memberships: [], status: "active",
    wallet: {
      activeCreditGrantCount: 1, availableCredits: credits, balanceCredits: credits,
      creditGrantCount: 1, creditLedger: [], expiringSoonCredits: 0,
      nearestExpiryAt: null, reservedCredits: 0, totalGrantedCredits: credits, walletId: `wallet-${id}`,
    },
  };
}

function renderAdmin(overrides: Partial<AuthState> = {}) {
  const auth: AuthState = {
    authenticated: true, error: null, loading: false, ...platformAuth("platform_operator"),
    login: vi.fn(), logout: vi.fn(), refreshMe: vi.fn(), register: vi.fn(),
    verifyEmail: vi.fn(), resendEmailVerification: vi.fn(), sessionId: "session-1", tenant: null, user: null,
    ...overrides,
  };
  return render(<AuthContext.Provider value={auth}><AdminPage /></AuthContext.Provider>);
}

function metricValue(label: string) {
  return screen.getByText(label).nextElementSibling?.textContent;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/account/admin");
  vi.mocked(adminApi.searchAdminUsers).mockImplementation(async (query) => ({
    items: query ? [createUser("filtered-user", 80)] : [createUser("first-user", 100), createUser("second-user", 200)],
    query: query ?? "",
  }));
  vi.mocked(adminApi.listAdminRedeemCodes).mockResolvedValue({ items: Array.from({ length: 50 }, (_, index) => ({
    code: null, createdAt: "2026-09-01T00:00:00Z", createdByEmail: null, createdByName: null,
    credits: 100, expiresAt: null, id: `code-${index}`, maxRedemptions: 1, reason: null,
    redeemedCount: 0, status: "unredeemed", tenantId: null, tenantName: null,
  })) });
  vi.mocked(adminApi.listAdminRedeemCodeRedemptions).mockResolvedValue({ items: [] });
  vi.mocked(adminApi.listAdminAnnouncements).mockResolvedValue({ items: [] });
  vi.mocked(adminApi.listAdminWorkflowRuns).mockResolvedValue({ items: [] });
  vi.mocked(adminApi.getAdminAiRouteStats).mockResolvedValue({ routes: [], summary: {
    averageLatencyMs: null, failedCalls: 0, successRate: 0, successfulCalls: 0, totalCalls: 0, windowMinutes: 30,
  } });
});

describe("AdminPage result coverage", () => {
  it("locks credit writes and reuses the same idempotency key after an ambiguous failure", async () => {
    const user={...createUser("money-user",100),memberships:[{tenantId:"tenant-1",tenantName:"工作区一",roleKey:"tenant_owner",membershipStatus:"active"}]} as adminApi.AdminUser;
    vi.mocked(adminApi.searchAdminUsers).mockResolvedValue({items:[user],query:""});
    let fail!: (reason:Error)=>void;
    vi.mocked(adminApi.grantAdminCredits).mockImplementationOnce(()=>new Promise((_resolve,reject)=>{fail=reject;}));
    renderAdmin(platformAuth());
    await waitFor(()=>expect(metricValue("当前结果用户数")).toBe("1"));
    fireEvent.click(screen.getByRole("button",{name:"用户管理",exact:true}));
    fireEvent.click(screen.getByRole("button",{name:"目标工作区关系 请选择工作区关系"}));
    fireEvent.click(screen.getByRole("menuitem",{name:"工作区一"}));
    const grant=screen.getByRole("button",{name:"发放积分",exact:true});
    fireEvent.click(grant); fireEvent.click(grant);
    expect(adminApi.grantAdminCredits).toHaveBeenCalledTimes(1);
    expect(grant).toHaveProperty("disabled",true);
    const first=vi.mocked(adminApi.grantAdminCredits).mock.calls[0][0];
    expect(first.idempotencyKey).toEqual(expect.any(String));
    fail(new Error("网络断开，结果待确认"));
    await screen.findByText("网络断开，结果待确认");
    vi.mocked(adminApi.grantAdminCredits).mockRejectedValueOnce(new Error("仍未连接"));
    fireEvent.click(screen.getByRole("button",{name:"发放积分",exact:true}));
    await screen.findByText("仍未连接");
    expect(vi.mocked(adminApi.grantAdminCredits).mock.calls[1][0].idempotencyKey).toBe(first.idempotencyKey);
    fireEvent.change(screen.getByDisplayValue("运营发放积分"),{target:{value:"用户补偿审批通过"}});
    vi.mocked(adminApi.grantAdminCredits).mockRejectedValueOnce(new Error("第三次待确认"));
    fireEvent.click(screen.getByRole("button",{name:"发放积分",exact:true}));
    await screen.findByText("第三次待确认");
    expect(adminApi.grantAdminCredits).toHaveBeenCalledTimes(3);
    expect(vi.mocked(adminApi.grantAdminCredits).mock.calls[2][0].idempotencyKey).not.toBe(first.idempotencyKey);
  });
  it("requires a chosen membership and never assumes the first tenant", () => {
    const user={...createUser("multi",10),memberships:[{tenantId:"a",roleKey:"tenant_owner"},{tenantId:"b",roleKey:"tenant_viewer"}]} as adminApi.AdminUser;
    expect(getAdminUserDetailState(user).membership).toBeNull();
    expect(getAdminUserDetailState(user,"b").membership?.tenantId).toBe("b");
    expect(getAdminUserDetailState(user,"b").workspaceControlsDisabled).toBe(false);
  });
  it("uses server user cursors and resets them when filters change", async () => {
    vi.mocked(adminApi.searchAdminUsers).mockResolvedValue({items:[createUser("first-user",100)],query:"",hasMore:true,nextCursor:"next-user-page",asOf:"2026-09-21T00:00:00Z"});
    renderAdmin();
    await waitFor(()=>expect(metricValue("当前结果用户数")).toBe("1"));
    fireEvent.click(screen.getByRole("button",{name:"用户管理",exact:true}));
    fireEvent.click(screen.getByRole("button",{name:"下一页用户"}));
    await waitFor(()=>expect(adminApi.searchAdminUsers).toHaveBeenLastCalledWith("",50,expect.objectContaining({cursor:"next-user-page"})));
    fireEvent.click(screen.getByRole("button",{name:"用户状态 全部状态"}));
    fireEvent.click(screen.getByRole("menuitem",{name:"已停用"}));
    await waitFor(()=>expect(adminApi.searchAdminUsers).toHaveBeenLastCalledWith("",50,expect.objectContaining({status:"disabled"})));
    expect(window.location.search).not.toContain("cursor");
  });
  it("requires and sends a reason for user suspension", async () => {
    renderAdmin();
    await waitFor(() => expect(metricValue("当前结果用户数")).toBe("2"));
    fireEvent.click(screen.getByRole("button", { name: "用户管理", exact: true }));
    const suspend = screen.getByRole("button", { name: "停用用户账号" });
    expect((suspend as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("账号状态变更原因"), {target:{value:"经核实违反平台使用规则"}});
    fireEvent.click(suspend);
    await waitFor(()=>expect(adminApi.updateAdminUserStatus).toHaveBeenCalledWith({status:"disabled",targetUserId:"first-user",reason:"经核实违反平台使用规则"}));
  });
  it("keeps operator user actions separate from money and role administration", async () => {
    renderAdmin();
    await waitFor(() => expect(metricValue("当前结果用户数")).toBe("2"));
    fireEvent.click(screen.getByRole("button", { name: "用户管理", exact: true }));
    expect(screen.queryByRole("button", { name: "发放积分", exact: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "增加积分", exact: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "重置临时密码", exact: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "保存会员等级", exact: true })).toBeNull();
    expect(screen.getByRole("button", { name: "停用用户账号" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "积分与兑换码", exact: true }));
    expect(screen.queryByRole("button", { name: "创建兑换码", exact: true })).toBeNull();
  });

  it("does not fetch operations data for legacy tenant administrators", () => {
    renderAdmin({ roles: ["tenant_admin"], permissions: ["admin:system"] });
    expect(screen.getByText("当前账号没有运营后台权限。")).toBeTruthy();
    expect(adminApi.searchAdminUsers).not.toHaveBeenCalled();
  });

  it("labels capped list summaries as current results instead of platform totals", async () => {
    renderAdmin();

    await waitFor(() => expect(metricValue("当前结果用户数")).toBe("2"));
    expect(metricValue("当前结果可用积分")).toBe("300");
    expect(metricValue("当前结果管理员成员数")).toBe("0");
    expect(metricValue("当前结果已使用积分")).toBe("0");
    expect(metricValue("当前结果到期用户数")).toBe("0");
    expect(metricValue("已加载兑换码")).toBe("50");
    expect(screen.getByText(/用户与积分统计仅覆盖当前筛选返回的最多 50 位用户/)).toBeTruthy();
    expect(screen.getByText(/兑换码仅覆盖已加载的最多 50 条记录/)).toBeTruthy();
    expect(screen.getByText(/以上列表统计不代表平台总量/)).toBeTruthy();
    expect(adminApi.searchAdminUsers).toHaveBeenCalledWith("", 50);
    expect(adminApi.listAdminRedeemCodes).toHaveBeenCalledWith({ limit: 50 });
    for (const label of ["用户数", "管理员数", "可用积分", "已使用积分", "有积分到期的用户", "兑换码"]) {
      expect(screen.queryByText(label, { exact: true })).toBeNull();
    }
  });

  it("keeps filtered counts explicitly scoped when returning from user search to overview", async () => {
    renderAdmin();
    await waitFor(() => expect(metricValue("当前结果用户数")).toBe("2"));
    fireEvent.click(screen.getByRole("button", { name: "用户管理", exact: true }));
    fireEvent.change(screen.getByPlaceholderText("搜索邮箱或名称"), { target: { value: "filtered" } });

    await waitFor(() => expect(metricValue("当前结果用户数")).toBe("1"));
    fireEvent.click(screen.getByRole("button", { name: "总览", exact: true }));

    expect(metricValue("当前结果可用积分")).toBe("80");
    expect(screen.getByText("当前用户筛选：filtered")).toBeTruthy();
    expect(screen.getByText(/以上列表统计不代表平台总量/)).toBeTruthy();
  });
});

describe("AdminPage module", () => {
  it("loads when the prompt library tab is registered", async () => {
    const module = await import("./AdminPage");

    expect(module.AdminPage).toEqual(expect.any(Function));
  });

  it("counts a multi-workspace user's personal wallet once", () => {
    expect(sumAvailableWalletCredits([
      {
        id: "user-1",
        wallet: { availableCredits: 310 },
        memberships: [{ tenantId: "workspace-1" }, { tenantId: "workspace-2" }],
      },
      {
        id: "user-2",
        wallet: { availableCredits: 90 },
        memberships: [{ tenantId: "workspace-3" }],
      },
    ] as never)).toBe(400);
  });

  it("invalidates shared billing summaries after a wallet mutation", () => {
    const listener = vi.fn();
    window.addEventListener(BILLING_SUMMARY_INVALIDATE_EVENT, listener);

    invalidateBillingSummary();

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(BILLING_SUMMARY_INVALIDATE_EVENT, listener);
  });

  it("keeps a wallet visible while disabling workspace controls without memberships", () => {
    expect(getAdminUserDetailState({
      id: "user-1",
      memberships: [],
      wallet: { availableCredits: 310, balanceCredits: 450 },
    } as never)).toMatchObject({
      wallet: { availableCredits: 310, balanceCredits: 450 },
      workspaceControlsDisabled: true,
    });
  });
});
