import { describe, expect, test } from "vitest";
import {
  PLATFORM_CAPABILITIES,
  resolvePlatformCapabilities,
  sanitizeTenantPermissions,
} from "../src/modules/platform-access/platform-access.policy.js";

describe("independent platform access", () => {
  test.each([null, "tenant_admin", "tenant_owner", "system_admin", "admin_email", "viewer"])(
    "%s grants no platform capability", (role) => {
      expect(resolvePlatformCapabilities(role)).toEqual([]);
    },
  );

  test("operator can inspect global operations and operate existing routes without sensitive authority", () => {
    const permissions = resolvePlatformCapabilities("platform_operator");
    expect(permissions).toEqual(expect.arrayContaining([
      "platform:console:access", "platform:users:read", "platform:users:operate",
      "platform:usage:read", "platform:tasks:read", "platform:routes:write",
      "platform:connections:read", "platform:models:read", "platform:content:manage",
      "platform:payments:read", "platform:redeem:operate", "platform:audit:read",
    ]));
    for (const permission of ["platform:roles:manage", "platform:connections:manage",
      "platform:pricing:publish", "platform:billing:adjust", "platform:billing:manage",
      "platform:integrations:manage", "platform:users:manage", "admin:system"]) {
      expect(permissions).not.toContain(permission);
    }
  });

  test("super admin receives explicit capabilities, not a fabricated legacy role", () => {
    expect(resolvePlatformCapabilities("platform_super_admin")).toEqual([...PLATFORM_CAPABILITIES]);
    expect(resolvePlatformCapabilities("platform_super_admin")).toContain("platform:roles:manage");
  });

  test("tenant permissions cannot smuggle platform and legacy privileged claims", () => {
    expect(sanitizeTenantPermissions([
      "flow:update", "billing:read", "billing:manage", "tenant:manage", "admin:system",
      "provider:read", "provider:manage", "credential:manage", "billing:plans:manage",
      "billing:payments:manage", "billing:refund", "platform:roles:manage",
    ])).toEqual(["flow:update", "billing:read", "billing:manage", "tenant:manage"]);
  });

  test("callers cannot mutate the shared capability policy", () => {
    resolvePlatformCapabilities("platform_operator").push("platform:roles:manage" as never);
    expect(resolvePlatformCapabilities("platform_operator")).not.toContain("platform:roles:manage");
  });
});
