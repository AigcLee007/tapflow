import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../../auth/useAuth";
import { AiSettingsPage } from "./AiSettingsPage";

const listAiModelCatalogMock = vi.fn();
const listAiModelRoutesMock = vi.fn();
const listAdminRoutesMock = vi.fn();
const listAdminProvidersMock = vi.fn();
const listAdminModelsMock = vi.fn();
const listAdminProviderConnectionsMock = vi.fn();
const listAdminCredentialsMock = vi.fn();
const updateAdminRouteMock = vi.fn();

vi.mock("../../services/v2AiModelCatalogApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/v2AiModelCatalogApi")>();
  return {
    ...actual,
    listAiModelCatalog: (...args: Parameters<typeof actual.listAiModelCatalog>) =>
      listAiModelCatalogMock(...args),
    listAiModelRoutes: (...args: Parameters<typeof actual.listAiModelRoutes>) =>
      listAiModelRoutesMock(...args),
    testAiRoute: vi.fn(),
  };
});

vi.mock("../../services/v2AiGatewayAdminApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/v2AiGatewayAdminApi")>();
  return {
    ...actual,
    listAdminRoutes: () => listAdminRoutesMock(),
    listAdminProviders: () => listAdminProvidersMock(),
    listAdminModels: () => listAdminModelsMock(),
    listAdminProviderConnections: () => listAdminProviderConnectionsMock(),
    listAdminCredentials: () => listAdminCredentialsMock(),
    updateAdminRoute: (...args: Parameters<typeof actual.updateAdminRoute>) =>
      updateAdminRouteMock(...args),
  };
});

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
    tenant: { id: "tenant-1", name: "Test Tenant", plan: "pro", slug: "test", status: "active" },
    user: { displayName: "Tester", email: "tester@example.com", id: "user-1", status: "active" },
  };
}

describe("AiSettingsPage", () => {
  beforeEach(() => {
    updateAdminRouteMock.mockReset();
    listAiModelCatalogMock.mockResolvedValue([
      {
        id: "catalog-1",
        capabilities: {},
        defaultRouteKey: "image.test.line1",
        displayName: "Test Image",
        modality: "image",
        modelFamily: "test-image",
        modelId: "model-1",
        modelKey: "test-image",
        sortOrder: 1,
        status: "active",
        uiSchema: {},
      },
    ]);
    listAiModelRoutesMock.mockResolvedValue([
      {
        estimatedCredits: 10,
        minChargeCredits: 10,
        modality: "image",
        modelFamily: "test-image",
        modelKey: "test-image",
        pricingUnit: "image_generation",
        providerKey: "openai",
        providerName: "OpenAI",
        routeId: "route-1",
        routeKey: "image.test.line1",
        routeLabel: "线路一",
      },
    ]);
    listAdminRoutesMock.mockResolvedValue([
      {
        id: "admin-route-1",
        routeKey: "image.test.line1",
        routeLabel: "线路一",
        providerId: "provider-1",
        modelId: "model-1",
        credentialId: null,
        modality: "image",
        status: "active",
        baseUrlOverride: null,
        requestConfig: {},
        pricing: {},
        tenantId: "tenant-1",
        connectionId: "connection-1",
      },
    ]);
    listAdminProvidersMock.mockResolvedValue([
      {
        id: "provider-1",
        key: "openai",
        kind: "openai-compatible",
        name: "OpenAI",
        status: "active",
        defaultBaseUrl: "https://api.openai.com/v1",
        capabilities: {},
      },
    ]);
    listAdminModelsMock.mockResolvedValue([
      {
        id: "model-1",
        providerId: "provider-1",
        modelKey: "gpt-image-1",
        displayName: "GPT Image 1",
        modality: "image",
        status: "active",
      },
    ]);
    listAdminProviderConnectionsMock.mockResolvedValue([
      {
        id: "connection-1",
        providerId: "provider-1",
        credentialId: null,
        name: "Main Connection",
        adapterKind: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        environment: "production",
        status: "active",
        metadata: {},
        lastHealthStatus: "ok",
        lastHealthCheckedAt: null,
        tenantId: "tenant-1",
        createdBy: null,
      },
    ]);
    listAdminCredentialsMock.mockResolvedValue([]);
  });

  test("renders route management controls with custom menu triggers", async () => {
    render(
      <AuthContext.Provider value={createAuthState()}>
        <AiSettingsPage />
      </AuthContext.Provider>,
    );

    expect(await screen.findByRole("button", { name: "新增线路" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "新增线路" }));

    expect(await screen.findByRole("button", { name: "create route provider OpenAI" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "create route connection Main Connection / production" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "create route model GPT Image 1 / gpt-image-1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "create route status 启用" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "edit route connection 请选择连接" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "edit route status 启用" })).toBeTruthy();
  });

  test("allows disabling a system route when it is not the default route", async () => {
    listAiModelCatalogMock.mockResolvedValueOnce([
      {
        id: "catalog-1",
        capabilities: {},
        defaultRouteKey: "image.test.line2",
        displayName: "Test Image",
        modality: "image",
        modelFamily: "test-image",
        modelId: "model-1",
        modelKey: "test-image",
        sortOrder: 1,
        status: "active",
        uiSchema: {},
      },
    ]);
    listAdminRoutesMock.mockResolvedValueOnce([
      {
        id: "admin-route-1",
        routeKey: "image.test.line1",
        routeLabel: "线路一",
        providerId: "provider-1",
        modelId: "model-1",
        credentialId: null,
        modality: "image",
        status: "active",
        baseUrlOverride: null,
        requestConfig: {},
        pricing: {},
        tenantId: null,
        connectionId: "connection-1",
      },
    ]);
    updateAdminRouteMock.mockResolvedValue({
      id: "admin-route-1",
      routeKey: "image.test.line1",
      routeLabel: "线路一",
      providerId: "provider-1",
      modelId: "model-1",
      credentialId: null,
      modality: "image",
      status: "inactive",
      baseUrlOverride: null,
      requestConfig: {},
      pricing: {},
      tenantId: null,
      connectionId: "connection-1",
    });

    render(
      <AuthContext.Provider value={createAuthState()}>
        <AiSettingsPage />
      </AuthContext.Provider>,
    );

    const disableButton = await screen.findByRole("button", { name: "停用线路" });
    expect(disableButton.hasAttribute("disabled")).toBe(false);

    fireEvent.click(disableButton);

    expect(updateAdminRouteMock).toHaveBeenCalledWith("admin-route-1", {
      status: "inactive",
    });
  });
});
