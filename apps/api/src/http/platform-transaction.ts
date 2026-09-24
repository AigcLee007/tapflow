import type { Pool, PoolClient } from "pg";
import { resolvePlatformCapabilities, type PlatformCapability } from "../modules/platform-access/platform-access.policy.js";

export type PlatformDbContext = { tenantId?: string | null; userId: string | null };
export class PlatformTransactionError extends Error {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN";
  constructor() { super("Platform permission required"); }
}

/** Recheck database authority inside the transaction; never use a tenant role. */
export async function setPlatformContext(client: PoolClient, context: PlatformDbContext, capability: PlatformCapability): Promise<string> {
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [context.tenantId ?? ""]);
  await client.query("SELECT set_config('app.user_id', $1, true)", [context.userId ?? ""]);
  const result = await client.query<{ role_key: string | null }>("SELECT app.current_platform_role() AS role_key");
  const role = result.rows[0]?.role_key;
  if (!resolvePlatformCapabilities(role).includes(capability)) {
    throw new PlatformTransactionError();
  }
  await client.query("SELECT set_config('app.platform_scope', $1, true)", [capability]);
  // The legacy wallet procedures require this flag. Never set it for operators
  // or for ordinary read/content transactions, even when the caller is a super admin.
  const sensitiveBilling = role === "platform_super_admin" && ["platform:billing:adjust", "platform:billing:manage"].includes(capability);
  await client.query("SELECT set_config('app.is_system_admin', $1, true)", [sensitiveBilling ? "true" : "false"]);
  return role!;
}

export async function withPlatformTransaction<T>(pool: Pool, context: PlatformDbContext, capability: PlatformCapability, callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setPlatformContext(client, context, capability);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
