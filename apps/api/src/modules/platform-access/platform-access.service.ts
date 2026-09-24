import { createPgPool, withUserTransaction } from "@aigc-flow/db";
import type { Pool, PoolClient } from "pg";
import {
  isPlatformRole, resolvePlatformCapabilities, type PlatformRole,
} from "./platform-access.policy.js";

export type PlatformAccess = { permissions: string[]; roles: PlatformRole[]; version: number };
export type PlatformRoleAssignment = {
  id: string;
  userId: string;
  roleKey: PlatformRole;
  version: number;
  reason: string;
  grantedBy: string | null;
  grantedAt: string;
  revokedBy: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
};
export type PlatformRoleChange = {
  targetUserId: string;
  roleKey: PlatformRole | null;
  expectedVersion: number;
  reason: string;
};

export class PlatformAccessError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = "PlatformAccessError";
  }
}

export async function readPlatformAccessWithClient(client: PoolClient, userId: string): Promise<PlatformAccess> {
  const result = await client.query<{ role_key: string; version: number }>(
    `SELECT assignment.role_key, assignment.version FROM platform_role_assignments AS assignment
     JOIN users ON users.id = assignment.user_id
     WHERE assignment.user_id = $1::uuid AND assignment.revoked_at IS NULL
       AND users.status = 'active' LIMIT 1`, [userId],
  );
  const row = result.rows[0];
  const role = row && isPlatformRole(row.role_key) ? row.role_key : null;
  return {
    permissions: resolvePlatformCapabilities(role),
    roles: role ? [role] : [],
    version: row?.version ?? 0,
  };
}

function translateDatabaseError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  const codes: Record<string, [number, string]> = {
    PLATFORM_ACCESS_FORBIDDEN: [403, "只有平台超级管理员可以管理平台角色"],
    PLATFORM_ROLE_VERSION_CONFLICT: [409, "角色已变更，请刷新后重试"],
    PLATFORM_LAST_SUPER_ADMIN: [409, "不能移除最后一位有效的平台超级管理员"],
    PLATFORM_TARGET_INACTIVE: [409, "目标用户不存在或未激活"],
    PLATFORM_ROLE_NOT_ASSIGNED: [404, "该用户没有有效的平台角色"],
    PLATFORM_INVALID_ROLE_CHANGE: [400, "平台角色或变更原因无效"],
  };
  for (const [code, [statusCode, detail]] of Object.entries(codes)) {
    if (message.includes(code)) throw new PlatformAccessError(statusCode, code, detail);
  }
  throw error;
}

export class PlatformAccessService {
  readonly pool: Pool;
  constructor(options: { pool?: Pool } = {}) { this.pool = options.pool ?? createPgPool(); }

  async resolveForUser(userId: string): Promise<PlatformAccess> {
    return withUserTransaction({ userId }, (client) => readPlatformAccessWithClient(client, userId), this.pool);
  }

  async listAssignments(context: { userId: string | null }): Promise<PlatformRoleAssignment[]> {
    if (!context.userId) throw new PlatformAccessError(401, "UNAUTHORIZED", "请先登录");
    try {
      return await withUserTransaction({ userId: context.userId }, async (client) => {
        const result = await client.query<{ assignment: PlatformRoleAssignment }>(
          "SELECT assignment FROM app.list_platform_role_assignments() AS assignment",
        );
        return result.rows.map((row) => row.assignment);
      }, this.pool);
    } catch (error) { return translateDatabaseError(error); }
  }

  async changeRole(context: { userId: string | null; requestId?: string | null }, input: PlatformRoleChange): Promise<PlatformRoleAssignment> {
    if (!context.userId) throw new PlatformAccessError(401, "UNAUTHORIZED", "请先登录");
    if ((input.roleKey !== null && !isPlatformRole(input.roleKey))
      || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0
      || typeof input.reason !== "string" || input.reason.trim().length < 5 || input.reason.trim().length > 500) {
      throw new PlatformAccessError(400, "PLATFORM_INVALID_ROLE_CHANGE", "请填写 5 至 500 字的角色变更原因");
    }
    try {
      return await withUserTransaction({ userId: context.userId }, async (client) => {
        const result = await client.query<{ assignment: PlatformRoleAssignment }>(
          `SELECT app.change_platform_role($1::uuid, $2, $3, $4, $5) AS assignment`,
          [input.targetUserId, input.roleKey, input.expectedVersion, input.reason.trim(), context.requestId ?? null],
        );
        return result.rows[0].assignment;
      }, this.pool);
    } catch (error) { return translateDatabaseError(error); }
  }
}
