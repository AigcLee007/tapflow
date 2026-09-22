import { describe, expect, test } from "vitest";
import { platformAuth } from "../test/platformAuth";
import { getAdminPage, getAdminRedirect, getVisibleAdminPages } from "./adminNavigation";

describe("canonical admin navigation", () => {
  test.each([
    ["/admin", "#users", "/admin/users"], ["/admin", "#admins", "/admin/access"],
    ["/admin", "#credits", "/admin/wallets"], ["/admin", "#monitor", "/admin/system/health"],
    ["/account/ai-settings", "", "/admin/models"],
    ["/account/provider-settings", "", "/admin/connections"],
    ["/account/template-library", "", "/admin/integrations"],
    ["/account/inspection", "", "/admin/inspection"],
  ])("maps %s%s to %s without losing filters", (pathname, hash, target) => {
    expect(getAdminRedirect({ pathname, hash, search: "?model=image&route=line-1&connection=c1" }))
      .toBe(`${target}?model=image&route=line-1&connection=c1`);
  });

  test("preserves canonical template detail and unknown paths for the router", () => {
    expect(getAdminRedirect({ pathname: "/admin/templates/t1", search: "", hash: "" })).toBeNull();
    expect(getAdminPage("/admin/templates/t1")?.path).toBe("/admin/templates");
    expect(getAdminPage("/admin/not-a-page")).toBeNull();
  });

  test("lists operator pages while hiding sensitive settings", () => {
    const pages = getVisibleAdminPages(platformAuth("platform_operator")).map((page) => page.path);
    expect(pages).toEqual(expect.arrayContaining(["/admin/overview", "/admin/users", "/admin/models", "/admin/connections", "/admin/inspection", "/admin/templates"]));
    expect(pages).not.toEqual(expect.arrayContaining(["/admin/access"]));
    expect(pages).not.toContain("/admin/integrations");
    expect(getVisibleAdminPages({ roles: ["system_admin"], permissions: ["admin:system"] })).toEqual([]);
    expect(getVisibleAdminPages(platformAuth()).map((page) => page.path)).toContain("/admin/access");
  });
});
