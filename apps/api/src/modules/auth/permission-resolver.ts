import { createPgPool, withUserTransaction } from "@aigc-flow/db";
import { sanitizeTenantPermissions } from "../platform-access/platform-access.policy.js";
import { readPlatformAccessWithClient } from "../platform-access/platform-access.service.js";

type PgPool = ReturnType<typeof createPgPool>;

export type ResolvedPermissions = {
  permissions: string[];
  roles: string[];
};

let sharedPool: PgPool | null = null;

function getSharedPool(): PgPool {
  if (!sharedPool) {
    sharedPool = createPgPool();
  }
  return sharedPool;
}

export async function resolvePermissionsForTenant(
  input: {
    tenantId: string | null;
    userId: string | null;
  },
  pool: PgPool = getSharedPool(),
): Promise<ResolvedPermissions> {
  if (!input.userId) {
    return {
      permissions: [],
      roles: [],
    };
  }

  return withUserTransaction(
    {
      tenantId: input.tenantId,
      userId: input.userId,
    },
    async (client) => {
      const platform = await readPlatformAccessWithClient(client, input.userId!);
      const combine = (permissions: string[], roles: string[]): ResolvedPermissions => ({
        permissions: [...new Set([...sanitizeTenantPermissions(permissions), ...platform.permissions])],
        roles: [...new Set([...roles.filter((role) => !role.startsWith("platform:") && !role.startsWith("platform_")), ...platform.roles])],
      });
      if (!input.tenantId) return combine([], []);
      const membership = await client.query<{ role_key: string }>(
        `
          SELECT role_key
          FROM tenant_memberships
          WHERE tenant_id = $1::uuid
            AND user_id = $2::uuid
            AND status = 'active'
          LIMIT 1
        `,
        [input.tenantId, input.userId],
      );

      const membershipRoleKey = membership.rows[0]?.role_key;
      if (!membershipRoleKey) {
        return combine([], []);
      }

      const role = await client.query<{ role_id: string }>(
        `
          SELECT id::text AS role_id
          FROM roles
          WHERE key = $1
            AND (tenant_id IS NULL OR tenant_id = $2::uuid)
          ORDER BY CASE WHEN tenant_id = $2::uuid THEN 0 ELSE 1 END
          LIMIT 1
        `,
        [membershipRoleKey, input.tenantId],
      );

      const roleId = role.rows[0]?.role_id;
      if (!roleId) {
        return combine([], [membershipRoleKey]);
      }

      const permissions = await client.query<{ permission_key: string }>(
        `
          SELECT permission_key
          FROM role_permissions
          WHERE role_id = $1::uuid
          ORDER BY permission_key ASC
        `,
        [roleId],
      );

      return combine(permissions.rows.map((row) => row.permission_key), [membershipRoleKey]);
    },
    pool,
  );
}
