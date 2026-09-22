import type { Pool } from "pg";
import { describe, expect, test, vi } from "vitest";
import type { ApiEnv } from "../src/config/env.js";
import { AuthService } from "../src/modules/auth/auth.service.js";
import { signAccessToken } from "../src/modules/auth/token.js";

describe("platform identity at authentication", () => {
  test("legacy ADMIN_EMAILS cannot elevate an authenticated tenant administrator", async () => {
    const userId = "10000000-0000-4000-8000-000000000001";
    const tenantId = "10000000-0000-4000-8000-000000000002";
    const sessionId = "10000000-0000-4000-8000-000000000003";
    const env = { adminEmails: ["legacy@example.test"], jwtAccessSecret: "test_secret_long_enough_for_signing", accessTokenTtlSeconds: 900 } as ApiEnv;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM auth_sessions")) return { rows: [{ email: "legacy@example.test", user_id: userId, tenant_id: tenantId, session_id: sessionId }] };
      if (sql.includes("FROM tenant_memberships")) return { rows: [{ role_key: "tenant_admin" }] };
      return { rows: [] };
    });
    const pool = { query, connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
    const service = new AuthService({ pool, env, authEmailSender: { sendVerificationCode: vi.fn(), sendPasswordResetCode: vi.fn() } });
    const token = await signAccessToken({ userId, tenantId, sessionId }, env);
    expect(await service.authenticateAccessToken(token)).toMatchObject({
      userId, tenantId, sessionId, roles: ["tenant_admin"], permissions: [],
    });
  });
});
