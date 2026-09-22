import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../../auth/useAuth";
import { AiSettingsPage } from "./AiSettingsPage";
import type { ModelConfigurationWizardProps } from "./ModelConfigurationWizard";
import { platformAuth } from "../../test/platformAuth";

const listAdminAiModelCatalogMock = vi.fn();
const listAdminAiModelRoutesMock = vi.fn();
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
    listAdminAiModelCatalog: (...args: Parameters<typeof actual.listAdminAiModelCatalog>) =>
      listAdminAiModelCatalogMock(...args),
    listAdminAiModelRoutes: (...args: Parameters<typeof actual.listAdminAiModelRoutes>) =>
      listAdminAiModelRoutesMock(...args),
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
    ...platformAuth(),
    refreshMe: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    sessionId: "session-1",
    tenant: { id: "tenant-1", name: "Test Tenant", plan: "pro", slug: "test", status: "active" },
    user: { displayName: "Tester", email: "tester@example.com", id: "user-1", status: "active" },
  };
}

describe("AiSettingsPage", () => {
  test("opens the requested non-default route from a detail link", async () => {
    window.history.replaceState(null,"","/admin/models?model=test-image&route=admin-route-2");
    const route={estimatedCredits:10,minChargeCredits:10,modality:"image",modelFamily:"test-image",modelKey:"test-image",pricingUnit:"image_generation",providerKey:"openai",providerName:"OpenAI"};
    listAdminAiModelRoutesMock.mockResolvedValue([{...route,routeId:"admin-route-1",routeKey:"image.test.line1",routeLabel:"线路一"},{...route,routeId:"admin-route-2",routeKey:"image.test.line2",routeLabel:"第二线路"}]);
    const adminRoute={providerId:"provider-1",modelId:"model-1",credentialId:null,modality:"image",status:"active",baseUrlOverride:null,requestConfig:{},pricing:{},tenantId:"tenant-1",connectionId:"connection-1"};
    listAdminRoutesMock.mockResolvedValue([{...adminRoute,id:"admin-route-1",routeKey:"image.test.line1",routeLabel:"线路一"},{...adminRoute,id:"admin-route-2",routeKey:"image.test.line2",routeLabel:"第二线路"}]);
    render(<AuthContext.Provider value={createAuthState()}><AiSettingsPage/></AuthContext.Provider>);
    await waitFor(()=>expect(screen.getByLabelText("显示线路名称")).toHaveProperty("value","第二线路"));
  });
  test("resolves usage deep links by model id and modality", async () => {
    window.history.replaceState(null,"","/admin/models?modelId=model-2&modality=text");
    const base={id:"catalog-x",capabilities:{},defaultRouteKey:null,displayName:"Target",modality:"text",modelFamily:"test",sortOrder:1,status:"active",uiSchema:{}};
    listAdminAiModelCatalogMock.mockResolvedValue([{...base,modelId:"model-1",modelKey:"first-model"},{...base,id:"catalog-target",modelId:"model-2",modelKey:"target-model"}]);
    render(<AuthContext.Provider value={createAuthState()}><AiSettingsPage/></AuthContext.Provider>);
    await waitFor(()=>expect(listAdminAiModelRoutesMock).toHaveBeenCalledWith("target-model"));
    expect(listAdminAiModelCatalogMock).toHaveBeenCalledWith("text");
    window.history.replaceState(null,"","/");
  });
  test.each(["tenant-1", null])("lets an operator save only permitted fields for a route in %s", async (tenantId) => {
    listAdminRoutesMock.mockResolvedValue([{
      id: "admin-route-1", routeKey: "image.test.line1", routeLabel: "线路一", providerId: "provider-1",
      modelId: "model-1", credentialId: null, modality: "image", status: "active", baseUrlOverride: null,
      requestConfig: {}, pricing: {}, tenantId, connectionId: "connection-1",
    }]);
    updateAdminRouteMock.mockResolvedValue({ routeLabel: "运营线路", routeKey: "image.test.line1" });
    render(<AuthContext.Provider value={{ ...createAuthState(), ...platformAuth("platform_operator") }}><AiSettingsPage /></AuthContext.Provider>);

    expect((await screen.findByRole("button", { name: "停用线路" }, { timeout: 5000 })).hasAttribute("disabled")).toBe(false);
    for (const name of ["配置新模型", "新增线路", "使用当前线路配置新模型", "复制为新线路", "删除"]) {
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
    for (const name of ["上游模型", "API 模式", "请求路径", "内部备注名称", "管理备注"]) {
      expect(screen.getByLabelText(name).hasAttribute("disabled")).toBe(true);
    }
    fireEvent.change(screen.getByLabelText("显示线路名称"), { target: { value: "运营线路" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "保存", exact: true })); });
    expect(updateAdminRouteMock).toHaveBeenCalledWith("admin-route-1", { routeLabel: "运营线路", status: "active" });
  });

  test("denies the former tenant-admin permission", () => {
    render(<AuthContext.Provider value={{ ...createAuthState(), roles: ["tenant_admin"], permissions: ["admin:system"] }}><AiSettingsPage /></AuthContext.Provider>);
    expect(screen.getByText("当前账号没有模型中心访问权限。")).toBeTruthy();
    expect(listAdminRoutesMock).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    window.history.replaceState(null,"","/");
    wizardMock.mockReset();
    updateAdminRouteMock.mockReset();
    listAdminAiModelCatalogMock.mockReset();
    listAdminAiModelRoutesMock.mockReset();
    listAdminRoutesMock.mockReset();
    listAdminProvidersMock.mockReset();
    listAdminModelsMock.mockReset();
    listAdminProviderConnectionsMock.mockReset();
    listAdminCredentialsMock.mockReset();

    listAdminAiModelCatalogMock.mockResolvedValue([
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
    listAdminAiModelRoutesMock.mockResolvedValue([
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
    listAdminAiModelCatalogMock.mockImplementation(async () => {
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
    listAdminAiModelRoutesMock.mockImplementation(async () => [
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

    expect(listAdminAiModelCatalogMock).toHaveBeenCalledTimes(2);
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
    listAdminAiModelCatalogMock.mockResolvedValueOnce([
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
      screen.getByText("当前是平台线路，修改会影响使用这条线路的工作区。"),
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
