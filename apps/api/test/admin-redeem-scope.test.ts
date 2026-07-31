import { describe, expect, test, vi } from "vitest";

import { AdminApiService } from "../src/modules/admin/admin.service.js";

const userId = "00000000-0000-4000-8000-000000000001";
const tenantId = "00000000-0000-4000-8000-000000000002";

describe("AdminApiService redeem-code scope", () => {
  test("creates a global code when a system administrator omits tenantId", async () => {
    let insertParameters: unknown[] | undefined;
    const client = {
      query: vi.fn(async (sql: string, parameters?: unknown[]) => {
        if (sql.includes("INSERT INTO billing_redeem_codes")) {
          insertParameters = parameters;
          return {
            rows: [{
              credits: "100",
              expires_at: null,
              id: "00000000-0000-4000-8000-000000000003",
              max_redemptions: 1,
              tenant_id: null,
            }],
          };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn(async () => client),
      query: vi.fn(async () => ({ rows: [] })),
    };
    const service = new AdminApiService({ pool: pool as never, billingService: {} as never });

    const created = await service.createRedeemCode(
      {
        ipHash: null,
        isAuthenticated: true,
        permissions: ["billing:redeem:manage"],
        requestId: "request-1",
        roles: ["system_admin"],
        sessionId: "session-1",
        tenantId,
        traceId: "trace-1",
        userAgent: null,
        userId,
      },
      { credits: 100, maxRedemptions: 1, reason: "global promotion" },
    );

    expect(created.tenantId).toBeNull();
    expect(insertParameters?.[0]).toBeNull();
  });
});
