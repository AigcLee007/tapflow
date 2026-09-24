import { describe, expect, test } from "vitest";

import { canAccessOperationsConsole, hasPlatformCapability, resolveProductRole } from "./productRoles";

describe("independent platform identity", () => {
  test.each(["tenant_admin", "tenant_owner", "system_admin", "admin_email"])("never promotes legacy or tenant role %s", (role) => {
    const auth = { roles: [role], permissions: ["admin:system", "platform:console:access", "platform:billing:adjust"] };
    expect(resolveProductRole(auth)).toBe("creator");
    expect(canAccessOperationsConsole(resolveProductRole(auth))).toBe(false);
    expect(hasPlatformCapability(auth, "platform:billing:adjust")).toBe(false);
  });

  test.each([
    ["platform_operator", "admin"],
    ["platform_super_admin", "super_admin"],
  ])("recognizes the independently granted %s identity", (role, expected) => {
    expect(resolveProductRole({ roles: [role], permissions: ["platform:console:access"] })).toBe(expected);
  });

  test("uses the server capabilities rather than inferring write access from a role", () => {
    const operator = { roles: ["platform_operator"], permissions: ["platform:console:access", "platform:routes:write"] };
    expect(hasPlatformCapability(operator, "platform:routes:write")).toBe(true);
    expect(hasPlatformCapability(operator, "platform:billing:adjust")).toBe(false);
    expect(hasPlatformCapability({ roles: ["platform_super_admin"], permissions: [] }, "platform:billing:adjust")).toBe(false);
    expect(hasPlatformCapability({ roles: [], permissions: ["platform:console:access"] }, "platform:console:access")).toBe(false);
  });
});
