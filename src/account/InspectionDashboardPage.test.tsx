import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import * as gatewayApi from "../services/v2AiGatewayAdminApi";
import * as catalogApi from "../services/v2AiModelCatalogApi";
import { InspectionDashboardPage } from "./InspectionDashboardPage";
import { platformAuth } from "../test/platformAuth";

vi.mock("../services/v2AiGatewayAdminApi");
vi.mock("../services/v2AiModelCatalogApi");

function renderInspection(roles: string[], permissions: string[] = platformAuth("platform_operator").permissions) {
  const auth: AuthState = {
    authenticated: true, error: null, loading: false, permissions, roles,
    login: vi.fn(), logout: vi.fn(), refreshMe: vi.fn(), register: vi.fn(),
    verifyEmail: vi.fn(), resendEmailVerification: vi.fn(),
    sessionId: "session-1", tenant: null, user: null,
  };
  return render(<AuthContext.Provider value={auth}><InspectionDashboardPage /></AuthContext.Provider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/account/inspection");
  vi.mocked(gatewayApi.listAdminProviders).mockResolvedValue([]);
  vi.mocked(gatewayApi.listAdminCredentials).mockResolvedValue([]);
  vi.mocked(gatewayApi.listAdminProviderConnections).mockResolvedValue([]);
  vi.mocked(gatewayApi.listAdminRoutes).mockResolvedValue([]);
  vi.mocked(gatewayApi.listAdminModels).mockResolvedValue([{
    id: "model-1", providerId: "provider-1", modelKey: "test-image",
    displayName: "测试服务商模型", modality: "image", status: "active",
  }]);
  vi.mocked(catalogApi.listAdminAiModelCatalog).mockImplementation(async (modality) => modality === "image" ? [{
    capabilities: {}, defaultRouteKey: null, displayName: "测试产品模型", id: "catalog-1",
    modality: "image", modelFamily: "test-image", modelId: "model-1", modelKey: "test-image",
    sortOrder: 0, status: "active", uiSchema: {},
  }] : []);
  vi.mocked(catalogApi.listAdminAiModelRoutes).mockResolvedValue([]);
});

describe("InspectionDashboardPage role actions", () => {
  test("lets ordinary admins inspect issues without inaccessible configuration actions", async () => {
    renderInspection(["platform_operator"]);

    expect(await screen.findByRole("heading", { name: "巡检面板" })).toBeTruthy();
    expect(screen.getByText("测试产品模型 没有默认线路")).toBeTruthy();
    expect(screen.getByText("测试服务商模型 还没有线路")).toBeTruthy();
    expect(screen.getByRole("button", { name: "刷新巡检" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "返回账户中心" })).toBeTruthy();
    for (const name of ["查看并处理", "去模型中心", "查看映射"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  test("allows platform super admins to inspect and navigate to configuration", async () => {
    const auth = platformAuth();
    renderInspection(auth.roles, auth.permissions);

    expect(await screen.findByRole("heading", { name: "巡检面板" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "模型中心" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "高级配置" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "查看并处理" })).toHaveLength(4);
    expect(screen.getByRole("button", { name: "查看映射" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "去模型中心" }));
    expect(window.location.pathname).toBe("/admin/models");
    expect(new URLSearchParams(window.location.search).get("model")).toBe("test-image");
  });

  test("does not load inspection data for creators", async () => {
    renderInspection(["tenant_owner"], ["project:read"]);

    expect(await screen.findByText("当前账号没有访问巡检面板的权限。")).toBeTruthy();
    expect(gatewayApi.listAdminProviders).not.toHaveBeenCalled();
    expect(catalogApi.listAdminAiModelCatalog).not.toHaveBeenCalled();
  });
});
