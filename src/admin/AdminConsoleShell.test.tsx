import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/useAuth";
import { platformAuth } from "../test/platformAuth";
import { AdminConsoleShell } from "./AdminConsoleShell";

test("uses shared compact navigation and opens only the current group", () => {
  const auth = { ...platformAuth("platform_operator"), user: { displayName: "运营" }, logout: vi.fn() } as unknown as AuthState;
  render(<AuthContext.Provider value={auth}><AdminConsoleShell pathname="/admin/models"><h1>业务页面</h1></AdminConsoleShell></AuthContext.Provider>);
  expect(screen.getByRole("heading", { name: "业务页面" })).toBeTruthy();
  const models = screen.getByRole("link", { name: "模型中心" });
  expect(models.getAttribute("aria-current")).toBe("page");
  expect(models.className).toContain("h-[38px]");
  expect(models.querySelector("span")?.className).toContain("text-xs");
  expect(screen.queryByRole("link", { name: "接入模板" })).toBeNull();
  expect(screen.queryByRole("link", { name: "用户管理" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "用户与权限" }));
  expect(screen.getByRole("link", { name: "用户管理" }).getAttribute("href")).toBe("/admin/users");
  expect(screen.queryByRole("link", { name: "模型中心" })).toBeNull();
});
