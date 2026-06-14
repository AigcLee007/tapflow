import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { ProviderSettingsPage } from "./ProviderSettingsPage";

const listAdminProvidersMock = vi.fn();
const listAdminCredentialsMock = vi.fn();
const listAdminProviderConnectionsMock = vi.fn();
const listAdminRoutesMock = vi.fn();
const listAdminModelsMock = vi.fn();

vi.mock("../services/v2AiGatewayAdminApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/v2AiGatewayAdminApi")>();
  return {
    ...actual,
    listAdminProviders: () => listAdminProvidersMock(),
    listAdminCredentials: () => listAdminCredentialsMock(),
    listAdminProviderConnections: () => listAdminProviderConnectionsMock(),
    listAdminRoutes: () => listAdminRoutesMock(),
    listAdminModels: () => listAdminModelsMock(),
  };
});

vi.mock("../services/v2AiModelCatalogApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/v2AiModelCatalogApi")>();
  return {
    ...actual,
    testAiRoute: vi.fn(),
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

describe("ProviderSettingsPage", () => {
  beforeEach(() => {
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
    listAdminCredentialsMock.mockResolvedValue([]);
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
    listAdminRoutesMock.mockResolvedValue([
      {
        id: "route-1",
        routeKey: "image.test.line1",
        routeLabel: "线路一",
        providerId: "provider-1",
        modelId: null,
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
    listAdminModelsMock.mockResolvedValue([]);
  });

  test("renders provider settings controls with custom menu triggers", async () => {
    render(
      <AuthContext.Provider value={createAuthState()}>
        <ProviderSettingsPage />
      </AuthContext.Provider>,
    );

    expect(await screen.findByRole("button", { name: "provider filter 全部服务商" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "model family filter 全部模型家族" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "credential provider OpenAI (openai)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "create connection provider OpenAI (openai)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "create connection credential 不绑定凭证" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Main Connection OpenAI \(openai\)/ }));
    expect(screen.getByRole("button", { name: "edit connection credential 不绑定凭证" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "edit connection status 启用" })).toBeTruthy();
  });
});
