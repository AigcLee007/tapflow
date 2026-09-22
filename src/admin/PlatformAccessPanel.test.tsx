import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/useAuth";
import { platformAuth } from "../test/platformAuth";
import * as http from "../services/v2HttpClient";
import { PlatformAccessPanel } from "./PlatformAccessPanel";

vi.mock("../services/v2HttpClient", () => ({ apiGet: vi.fn(), apiPatch: vi.fn() }));
const targetId = "00000000-0000-4000-8000-000000000001";
const assignment = { id: "assignment-1", userId: targetId, roleKey: "platform_operator", version: 3, revokedAt: null };
function renderPanel(role: "platform_operator" | "platform_super_admin" = "platform_super_admin") {
  const auth = { ...platformAuth(role), user: { id: "actor-1" } } as AuthState;
  return render(<AuthContext.Provider value={auth}><PlatformAccessPanel users={[{ id: targetId, email: "operator@example.com", displayName: "运营" }]} query="" onQueryChange={vi.fn()} selectedUserId={targetId} onSelectUser={vi.fn()} /></AuthContext.Provider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(http.apiGet).mockResolvedValue({ items: [assignment] });
  vi.mocked(http.apiPatch).mockResolvedValue({ assignment: { ...assignment, roleKey: "platform_super_admin", version: 4 } });
});

test("requires a reason and sends the observed platform version, never a tenant role update", async () => {
  renderPanel();
  const select = await screen.findByRole("button", { name: "平台角色 平台运营管理员" });
  await waitFor(() => expect(select).toHaveProperty("disabled", false));
  expect(screen.getByRole("button", { name: "保存平台授权" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(select);
  fireEvent.click(screen.getByRole("menuitem", { name: "平台超级管理员" }));
  fireEvent.change(screen.getByLabelText("授权变更原因"), { target: { value: "负责平台系统维护" } });
  fireEvent.click(screen.getByRole("button", { name: "保存平台授权" }));
  await waitFor(() => expect(http.apiPatch).toHaveBeenCalledWith(`/admin/platform-roles/${targetId}`, { roleKey: "platform_super_admin", expectedVersion: 3, reason: "负责平台系统维护" }));
  expect(await screen.findByText("平台授权已更新。")).toBeTruthy();
});

test("shows server conflict feedback and retains the typed reason", async () => {
  vi.mocked(http.apiPatch).mockRejectedValue(new Error("角色已变更，请刷新后重试"));
  renderPanel();
  await screen.findByRole("button", { name: "平台角色 平台运营管理员" });
  fireEvent.change(screen.getByLabelText("授权变更原因"), { target: { value: "职责调整撤销授权" } });
  fireEvent.click(screen.getByRole("button", { name: "平台角色 平台运营管理员" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "撤销平台授权" }));
  fireEvent.click(screen.getByRole("button", { name: "保存平台授权" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "角色已变更，请刷新后重试");
  expect(screen.getByLabelText("授权变更原因")).toHaveProperty("value", "职责调整撤销授权");
});

test("does not fetch or render platform role controls for operators", () => {
  renderPanel("platform_operator");
  expect(screen.queryByRole("button", { name: "保存平台授权" })).toBeNull();
  expect(http.apiGet).not.toHaveBeenCalled();
});

test("locks the target and reason while a role change is in flight", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(http.apiPatch).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  renderPanel();
  await screen.findByRole("button", { name: "平台角色 平台运营管理员" });
  fireEvent.change(screen.getByLabelText("授权变更原因"), { target: { value: "负责日常运营管理" } });
  fireEvent.click(screen.getByRole("button", { name: "保存平台授权" }));
  await waitFor(() => expect(http.apiPatch).toHaveBeenCalled());
  expect(screen.getByRole("button", { name: /目标用户/ })).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: /operator@example.com\s*平台运营管理员/ })).toHaveProperty("disabled", true);
  expect(screen.getByLabelText("搜索用户")).toHaveProperty("disabled", true);
  expect(screen.getByLabelText("授权变更原因")).toHaveProperty("disabled", true);
  finish({ assignment: { ...assignment, version: 4 } });
  expect(await screen.findByText("平台授权已更新。")).toBeTruthy();
  expect(screen.getByRole("button", { name: /目标用户/ })).toHaveProperty("disabled", false);
});
