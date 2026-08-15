import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../../auth/useAuth";
import { AiSettingsPage } from "./AiSettingsPage";
import type { ModelConfigurationWizardProps } from "./ModelConfigurationWizard";

const listAiModelCatalogMock = vi.fn();
const listAiModelRoutesMock = vi.fn();
const listAdminRoutesMock = vi.fn();
const listAdminProvidersMock = vi.fn();
const listAdminModelsMock = vi.fn();
const listAdminProviderConnectionsMock = vi.fn();
const listAdminCredentialsMock = vi.fn();
const updateAdminRouteMock = vi.fn();
const wizardMock = vi.fn();

vi.mock("./ModelConfigurationWizard", () => ({
  ModelConfigurationWizard: (props: ModelConfigurationWizardProps) => {
    wizardMock(props);
    return (
      <div
        data-backup-route-id={props.backupFromRoute?.route.id ?? ""}
        data-open={String(props.open)}
        data-testid="model-configuration-wizard"
      />
    );
  },
}));

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
    wizardMock.mockReset();
    updateAdminRouteMock.mockReset();
    listAiModelCatalogMock.mockReset();
    listAiModelRoutesMock.mockReset();
    listAdminRoutesMock.mockReset();
    listAdminProvidersMock.mockReset();
    listAdminModelsMock.mockReset();
    listAdminProviderConnectionsMock.mockReset();
    listAdminCredentialsMock.mockReset();

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

  test("opens the model configuration wizard from the primary entry and keeps advanced access visible", async () => {
    render(
      <AuthContext.Provider value={createAuthState()}>
        <AiSettingsPage />
      </AuthContext.Provider>,
    );

    expect(await screen.findByRole("button", { name: "配置新模型" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "高级配置" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "配置新模型" }));

    expect((await screen.findByTestId("model-configuration-wizard")).getAttribute("data-open")).toBe("true");
    expect(wizardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        open: true,
        backupFromRoute: undefined,
      }),
    );
  });

  test("publishing from the wizard reloads all admin data and closes the wizard", async () => {
    let refreshCount = 0;
    listAiModelCatalogMock.mockImplementation(async () => {
      refreshCount += 1;
      return refreshCount === 1
        ? [
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
          ]
        : [
            {
              id: "catalog-2",
              capabilities: {},
              defaultRouteKey: "image.test.line2",
              displayName: "Test Image 2",
              modality: "image",
              modelFamily: "test-image",
              modelId: "model-2",
              modelKey: "test-image-2",
              sortOrder: 2,
              status: "active",
              uiSchema: {},
            },
          ];
    });
    listAiModelRoutesMock.mockImplementation(async () => [
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

    render(
      <AuthContext.Provider value={createAuthState()}>
        <AiSettingsPage />
      </AuthContext.Provider>,
    );

    await screen.findByRole("button", { name: "配置新模型" });
    fireEvent.click(screen.getByRole("button", { name: "配置新模型" }));

    const wizardProps = wizardMock.mock.calls.at(-1)?.[0] as ModelConfigurationWizardProps;
    await act(async () => {
      await wizardProps.onPublished({
        routeId: "route-1",
        routeKey: "image.test.line2",
        routeLabel: "线路二",
        revision: 2,
      });
    });

    expect(listAiModelCatalogMock).toHaveBeenCalledTimes(2);
    expect(listAdminRoutesMock).toHaveBeenCalledTimes(2);
    expect(listAdminProvidersMock).toHaveBeenCalledTimes(2);
    expect(listAdminModelsMock).toHaveBeenCalledTimes(2);
    expect(listAdminProviderConnectionsMock).toHaveBeenCalledTimes(2);
    expect(listAdminCredentialsMock).toHaveBeenCalledTimes(2);
    expect((await screen.findByTestId("model-configuration-wizard")).getAttribute("data-open")).toBe("false");
  });

  test("opens the wizard from a selected route backup entry", async () => {
    render(
      <AuthContext.Provider value={createAuthState()}>
        <AiSettingsPage />
      </AuthContext.Provider>,
    );

    await screen.findByRole("button", { name: "配置新模型" });
    fireEvent.click((await screen.findAllByText("线路一"))[0]);
    fireEvent.click(screen.getByRole("button", { name: "使用当前线路配置新模型" }));

    const wizardProps = wizardMock.mock.calls.at(-1)?.[0] as ModelConfigurationWizardProps;
    expect(wizardProps.backupFromRoute?.route.id).toBe("admin-route-1");
    expect(wizardProps.backupFromRoute?.credential?.id).toBeUndefined();
    expect((await screen.findByTestId("model-configuration-wizard")).getAttribute("data-open")).toBe("true");
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
    expect(
      screen.getByText("当前是系统线路，参数只能查看和测试；你仍可以启停线路。需要修改参数时，请先复制成租户线路。"),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.click(disableButton);
    });

    expect(updateAdminRouteMock).toHaveBeenCalledWith("admin-route-1", {
      status: "inactive",
    });
  });

  test("allows disabling the only default route", async () => {
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
      tenantId: "tenant-1",
      connectionId: "connection-1",
    });

    render(
      <AuthContext.Provider value={createAuthState()}>
        <AiSettingsPage />
      </AuthContext.Provider>,
    );

    const disableButton = await screen.findByRole("button", { name: "停用线路" });
    expect(disableButton.hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "设为默认线路" }).hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText("当前是默认线路。停用后如果没有其他可用线路，该模型会从前台隐藏。"),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.click(disableButton);
    });

    expect(updateAdminRouteMock).toHaveBeenCalledWith("admin-route-1", {
      status: "inactive",
    });
  });
});
