import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/useAuth";
import { platformAuth } from "../test/platformAuth";
import { AppRouter } from "./AppRouter";

vi.mock("../billing/RechargeContext", () => ({ RechargeProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("./WorkspaceShell", () => ({ WorkspaceShell: ({ children }: { children: React.ReactNode }) => <div data-testid="workspace-shell">{children}</div> }));
vi.mock("./version/AppVersionReminder", () => ({ AppVersionReminder: () => null }));
vi.mock("../admin/AdminPage", () => ({ AdminPage: ({ section }: { section: string }) => <h1>运营页面 {section}</h1> }));
vi.mock("../account/ai-settings/AiSettingsPage", () => ({ AiSettingsPage: () => <h1>模型业务页面</h1> }));
vi.mock("../account/ProviderSettingsPage", () => ({ ProviderSettingsPage: () => <h1>连接业务页面</h1> }));
vi.mock("../flowCanvas/FlowProjectPage", () => ({ FlowProjectPage: () => null }));
vi.mock("../workbench/WorkbenchPage", () => ({ WorkbenchPage: () => null }));
vi.mock("../workspace/HomePage", () => ({ HomePage: () => null }));
vi.mock("../workspace/WorkspacePage", () => ({ WorkspacePage: () => null }));
vi.mock("../prompts/PromptPlazaPage", () => ({ PromptPlazaPage: () => null }));
vi.mock("../admin/templates/TemplateAdminEditorPage", () => ({ TemplateAdminEditorPage: ({ templateId }: { templateId: string }) => <h1>工作流模板 {templateId}</h1> }));
vi.mock("../console/ConsoleRecordsPage", () => ({ ConsoleRecordsPage: ({scope,resource,detailId}:{scope:string;resource:string;detailId?:string}) => <h1>{scope} {resource} {detailId ?? "列表"}</h1> }));
vi.mock("../console/ConsoleOverviewPage", () => ({ConsoleOverviewPage:({scope}:{scope:string})=><h1>{scope} 聚合概览</h1>}));
vi.mock("../admin/PaymentManagementPanel",()=>({PaymentManagementPanel:({mode}:{mode:string})=><p>支付模块 {mode}</p>}));

function openRouter(path: string, overrides: Partial<AuthState> = {}) {
  window.history.replaceState(null, "", path);
  const auth = { authenticated: true, loading: false, ...platformAuth("platform_operator"), user: { id: "operator" }, logout: vi.fn(), ...overrides } as AuthState;
  render(<AuthContext.Provider value={auth}><AppRouter /></AuthContext.Provider>);
}

describe("admin routing uses independent platform identity", () => {
  test.each(["tenant_admin", "system_admin", "admin_email"])("denies the old %s role without loading business pages", async (role) => {
    openRouter("/admin/users", { roles: [role], permissions: ["admin:system"] });
    expect(await screen.findByRole("heading", { name: "无权访问此管理页面" })).toBeTruthy();
    expect(screen.queryByText("运营页面 users")).toBeNull();
  });

  test("uses canonical pages inside the admin layout", async () => {
    openRouter("/admin#users");
    expect(await screen.findByRole("heading", { name: "运营页面 users" })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/users");
    expect(screen.getByRole("navigation", { name: "管理控制台导航" })).toBeTruthy();
    expect(screen.queryByTestId("workspace-shell")).toBeNull();
  });

  test("retains deep-link filters from the legacy model center", async () => {
    openRouter("/account/ai-settings?model=test&route=line-1");
    expect(await screen.findByRole("heading", { name: "模型业务页面" })).toBeTruthy();
    expect(window.location.pathname + window.location.search).toBe("/admin/models?model=test&route=line-1");
  });

  test("denies an operator direct access to sensitive integration configuration", async () => {
    openRouter("/admin/integrations");
    expect(await screen.findByRole("heading", { name: "无权访问此管理页面" })).toBeTruthy();
  });

  test("keeps existing workflow template detail addresses", async () => {
    openRouter("/admin/templates/template-1");
    expect(await screen.findByRole("heading", { name: "工作流模板 template-1" })).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe("/admin/templates/template-1"));
  });

  test.each([["/admin/overview","platform 聚合概览"],["/admin/usage","platform usage 列表"],["/admin/tasks/workflow%3Atask-1","platform tasks workflow:task-1"],["/admin/calls/call-1","platform calls call-1"]])("mounts the independent query page at %s",async(path,heading)=>{
    openRouter(path);
    expect(await screen.findByRole("heading",{name:heading})).toBeTruthy();
  });
  test("uses a personal navigation context for ordinary users",async()=>{
    openRouter("/account/usage/usage%3Aevent-1",{roles:["tenant_owner"],permissions:["flow:run"]});
    expect(await screen.findByRole("heading",{name:"self usage usage:event-1"})).toBeTruthy();
    expect(screen.getByRole("navigation",{name:"个人中心导航"})).toBeTruthy();
    expect(screen.queryByTestId("workspace-shell")).toBeNull();
  });
  test("separates payment orders from privileged plans",async()=>{
    openRouter("/admin/payments");
    expect(await screen.findByText("支付模块 payments")).toBeTruthy();
  });
  test("denies an operator direct access to plan changes",async()=>{
    openRouter("/admin/plans");
    expect(await screen.findByRole("heading",{name:"无权访问此管理页面"})).toBeTruthy();
  });
});
