import Fastify from "fastify";
import { describe, expect, test, vi } from "vitest";
import { registerAdminRoutes } from "../src/modules/admin/admin.routes.js";
import { registerAiGatewayAdminRoutes } from "../src/modules/ai-gateway/ai-gateway.routes.js";
import { registerAiPluginAdminRoutes } from "../src/modules/ai-plugins/ai-plugins.routes.js";
import { registerAiModelConfigurationRoutes } from "../src/modules/ai-model-configurations/ai-model-configurations.routes.js";
import { registerAiRouteTestRoutes } from "../src/modules/ai-route-tests/ai-route-tests.routes.js";
import { AdminApiService } from "../src/modules/admin/admin.service.js";
import { resolvePlatformCapabilities } from "../src/modules/platform-access/platform-access.policy.js";
import { registerPaymentRoutes } from "../src/modules/payments/payments.routes.js";
import { PlatformTransactionError } from "../src/http/platform-transaction.js";
import { registerAiModelCatalogRoutes } from "../src/modules/ai-model-catalog/ai-model-catalog.routes.js";

const id = "11111111-1111-4111-8111-111111111111";
const context = (permissions: string[], roles = ["platform_operator"]) => ({
  permissions, roles, userId: id, tenantId: id, sessionId: id,
  isAuthenticated: true, requestId: "test", traceId: "test", ipHash: null, userAgent: null,
});
const sensitiveRoutes = [
  ["POST", `/api/v2/admin/users/${id}/grant-credits`],
  ["POST", `/api/v2/admin/users/${id}/adjust-credits`],
  ["PATCH", `/api/v2/admin/users/${id}/role`],
  ["POST", `/api/v2/admin/users/${id}/reset-password`],
  ["POST", "/api/v2/admin/ai/connections"],
  ["PATCH", `/api/v2/admin/ai/connections/${id}`],
  ["POST", "/api/v2/admin/credentials"],
  ["POST", `/api/v2/admin/credentials/${id}/rotate`],
  ["PATCH", "/api/v2/admin/ai/pricing"],
  ["POST", "/api/v2/admin/billing/recharge-plans"],
  ["POST", `/api/v2/admin/billing/payments/${id}/refund`],
] as const;

async function appFor(permissions: string[], roles?: string[]) {
  const app = Fastify({ logger: false });
  app.addHook("onRequest", async (request) => { request.ctx = context(permissions, roles); });
  registerAdminRoutes(app);
  registerAiGatewayAdminRoutes(app);
  registerAiPluginAdminRoutes(app);
  registerAiModelConfigurationRoutes(app);
  registerAiRouteTestRoutes(app);
  registerPaymentRoutes(app);
  registerAiModelCatalogRoutes(app);
  return app;
}

describe("platform administration authority", () => {
  test("platform operators without flow:run can load admin catalogs, but cannot run creator catalogs", async () => {
    const app = await appFor(resolvePlatformCapabilities("platform_operator"), ["viewer", "platform_operator"]);
    app.decorate("aiModelCatalogService", { listPlatformModels: async () => [], listPlatformRoutes: async () => [] } as never);
    try {
      expect((await app.inject({ method: "GET", url: "/api/v2/admin/ai/model-catalog?modality=image" })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/api/v2/admin/ai/model-catalog/test-image/routes" })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/api/v2/ai/model-catalog?modality=image" })).statusCode).toBe(403);
    } finally { await app.close(); }
  });
  test.each(sensitiveRoutes)("legacy tenant authority cannot use %s %s", async (method, url) => {
    const app = await appFor(["admin:system", "provider:manage", "credential:manage"], ["tenant_admin"]);
    try {
      const response = await app.inject({ method, url, payload: {} });
      expect(response.statusCode).toBe(403);
    } finally { await app.close(); }
  });

  test.each(sensitiveRoutes)("operators cannot use sensitive %s %s", async (method, url) => {
    const app = await appFor(resolvePlatformCapabilities("platform_operator"));
    try {
      const response = await app.inject({ method, url, payload: {} });
      expect(response.statusCode).toBe(403);
    } finally { await app.close(); }
  });

  test.each(sensitiveRoutes)("super administrators reach validation for %s %s", async (method, url) => {
    const app = await appFor(resolvePlatformCapabilities("platform_super_admin"), ["platform_super_admin"]);
    try {
      const response = await app.inject({ method, url, payload: url.endsWith("reset-password") ? { password: "x" } : {} });
      // Invalid inputs prove the permission gate allowed the caller.
      expect(response.statusCode).toBe(400);
    } finally { await app.close(); }
  });

  test("operators can search users and read payment states", async () => {
    const app = await appFor(resolvePlatformCapabilities("platform_operator"));
    const searchUsers = vi.fn(async () => ({ items: [], query: "" }));
    const listAdminPayments = vi.fn(async () => ({ items: [] }));
    app.decorate("adminService", { searchUsers } as never);
    app.decorate("paymentsService", { listAdminPayments } as never);
    try {
      expect((await app.inject({ method: "GET", url: "/api/v2/admin/users" })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/api/v2/admin/billing/payments" })).statusCode).toBe(200);
      expect(searchUsers).toHaveBeenCalledOnce();
      expect(listAdminPayments).toHaveBeenCalledOnce();
    } finally { await app.close(); }
  });

  test("wallet grants and adjustments reject callers before opening a database transaction", async () => {
    const connect = vi.fn(() => { throw new Error("must not connect"); });
    const service = new AdminApiService({ pool: { connect } as never });
    const input = { credits: 10, reason: "support", targetUserId: id, tenantId: id, idempotencyKey: "test" };
    for (const identity of [context(["admin:system"], ["system_admin"]), context(resolvePlatformCapabilities("platform_operator"))]) {
      await expect(service.grantCredits(identity, input)).rejects.toMatchObject({ statusCode: 403 });
      await expect(service.adjustCredits(identity, { ...input, direction: "add" })).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(connect).not.toHaveBeenCalled();
  });

  test("a role revoked after request authentication returns forbidden from the payment read", async () => {
    const app = await appFor(resolvePlatformCapabilities("platform_operator"));
    app.decorate("paymentsService", { listAdminPayments: async () => { throw new PlatformTransactionError(); } } as never);
    try {
      const response = await app.inject({ method: "GET", url: "/api/v2/admin/billing/payments" });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("FORBIDDEN");
    } finally { await app.close(); }
  });
});
