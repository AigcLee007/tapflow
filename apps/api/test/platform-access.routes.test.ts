import Fastify from "fastify";
import { afterEach, describe, expect, test, vi } from "vitest";
import { registerPlatformAccessRoutes } from "../src/modules/platform-access/platform-access.routes.js";
import { resolvePlatformCapabilities } from "../src/modules/platform-access/platform-access.policy.js";
import { PlatformAccessError, type PlatformAccessService } from "../src/modules/platform-access/platform-access.service.js";

const userId = "20000000-0000-4000-8000-000000000001";
const targetId = "20000000-0000-4000-8000-000000000002";
const instances: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(instances.splice(0).map((app) => app.close())); });

function appFor(role: string | null, permissions = resolvePlatformCapabilities(role)) {
  const app = Fastify();
  instances.push(app);
  const service = { listAssignments: vi.fn(async () => []), changeRole: vi.fn(async () => ({ userId: targetId, version: 2 })) };
  app.decorate("platformAccessService", service as unknown as PlatformAccessService);
  app.addHook("onRequest", async (request) => {
    request.ctx = {
      isAuthenticated: role !== null, userId: role ? userId : null, permissions, roles: role ? [role] : [],
      tenantId: null, sessionId: "test-session", requestId: "test-request", traceId: "test-trace", ipHash: null, userAgent: null,
    };
  });
  registerPlatformAccessRoutes(app);
  return { app, service };
}

describe("platform role management HTTP boundary", () => {
  test.each([null, "viewer", "tenant_admin", "system_admin", "admin_email", "platform_operator"])(
    "%s cannot list or change platform roles", async (role) => {
      const { app, service } = appFor(role);
      for (const method of ["GET", "PATCH"] as const) {
        const response = await app.inject({ method,
          url: `/api/v2/admin/platform-roles${method === "PATCH" ? `/${targetId}` : ""}`,
          ...(method === "PATCH" ? { payload: { roleKey: "platform_super_admin", expectedVersion: 1, reason: "Attempted elevation" } } : {}),
        });
        expect(response.statusCode).toBe(role === null ? 401 : 403);
      }
      expect(service.listAssignments).not.toHaveBeenCalled();
      expect(service.changeRole).not.toHaveBeenCalled();
    },
  );

  test("legacy admin permission alone is denied", async () => {
    const { app } = appFor("tenant_admin", ["admin:system"] as never);
    expect((await app.inject({ method: "GET", url: "/api/v2/admin/platform-roles" })).statusCode).toBe(403);
  });

  test("explicit super admin can manage roles without a selected tenant", async () => {
    const { app, service } = appFor("platform_super_admin");
    const list = await app.inject({ method: "GET", url: "/api/v2/admin/platform-roles" });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({ items: [] });
    const changed = await app.inject({ method: "PATCH", url: `/api/v2/admin/platform-roles/${targetId}`,
      payload: { roleKey: null, expectedVersion: 1, reason: "  Reviewed revocation  " } });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toEqual({ assignment: { userId: targetId, version: 2 } });
    expect(service.changeRole).toHaveBeenCalledWith(expect.objectContaining({ userId, requestId: "test-request" }),
      { targetUserId: targetId, roleKey: null, expectedVersion: 1, reason: "Reviewed revocation" });
  });

  test.each([
    { roleKey: "tenant_admin", expectedVersion: 0, reason: "Reviewed role" },
    { roleKey: "platform_operator", expectedVersion: -1, reason: "Reviewed role" },
    { roleKey: "platform_operator", expectedVersion: 1.5, reason: "Reviewed role" },
    { roleKey: "platform_operator", expectedVersion: 0, reason: "bad" },
    { roleKey: "platform_operator", reason: "Reviewed role" },
    { roleKey: "platform_operator", expectedVersion: 0, reason: "Reviewed role", actorUserId: targetId },
  ])("invalid change is rejected before calling the service: %j", async (payload) => {
    const { app, service } = appFor("platform_super_admin");
    const response = await app.inject({ method: "PATCH", url: `/api/v2/admin/platform-roles/${targetId}`, payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(service.changeRole).not.toHaveBeenCalled();
  });

  test("invalid UUID is rejected", async () => {
    const { app, service } = appFor("platform_super_admin");
    const response = await app.inject({ method: "PATCH", url: "/api/v2/admin/platform-roles/not-a-user",
      payload: { roleKey: null, expectedVersion: 1, reason: "Reviewed revocation" } });
    expect(response.statusCode).toBe(400);
    expect(service.changeRole).not.toHaveBeenCalled();
  });

  test("preserves conflict status and request id from the transactional service", async () => {
    const { app, service } = appFor("platform_super_admin");
    service.changeRole.mockRejectedValueOnce(new PlatformAccessError(409, "PLATFORM_LAST_SUPER_ADMIN", "Cannot remove last super administrator"));
    const response = await app.inject({ method: "PATCH", url: `/api/v2/admin/platform-roles/${targetId}`,
      payload: { roleKey: null, expectedVersion: 1, reason: "Reviewed revocation" } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatchObject({ code: "PLATFORM_LAST_SUPER_ADMIN", requestId: "test-request" });
  });
});
