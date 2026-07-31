import type { Pool, PoolClient } from "pg";

export type PersonalWalletMigrationReport = {
  activeReservationCount: number;
  dryRun: boolean;
  migratedCredits: number;
  migratedGrantCount: number;
  sourceAvailableCredits: number;
  unresolvedTenants: Array<{
    reason: "missing_owner" | "ambiguous_owner";
    tenantId: string;
  }>;
  verificationMatched: boolean;
};

type SourceGrant = {
  expiresAt: string | null;
  id: string;
  availableCredits: number;
  tenantId: string;
};

type TenantOwner = {
  ownerIds: string[];
  tenantId: string;
};

function asNumber(value: string): number {
  return Number(value);
}

function sum(values: Iterable<number>): number {
  return Number([...values].reduce((total, value) => total + value, 0).toFixed(4));
}

async function setSystemAdmin(client: PoolClient): Promise<void> {
  await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
}

async function getActiveReservationCount(client: PoolClient): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM billing_credit_reservations
     WHERE status = 'reserved'`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function getSourceGrants(client: PoolClient): Promise<SourceGrant[]> {
  const result = await client.query<{
    available_credits: string;
    expires_at: string | null;
    id: string;
    tenant_id: string;
  }>(
    `SELECT
       id::text AS id,
       tenant_id::text AS tenant_id,
       GREATEST(remaining_credits - reserved_credits, 0)::text AS available_credits,
       expires_at::text AS expires_at
     FROM billing_credit_grants
     WHERE status = 'active'
       AND (expires_at IS NULL OR expires_at > now())
       AND remaining_credits > reserved_credits
     ORDER BY tenant_id, expires_at ASC NULLS LAST, created_at ASC, id ASC`,
  );
  return result.rows.map((row) => ({
    availableCredits: asNumber(row.available_credits),
    expiresAt: row.expires_at,
    id: row.id,
    tenantId: row.tenant_id,
  }));
}

async function getTenantOwners(client: PoolClient, tenantIds: string[]): Promise<TenantOwner[]> {
  if (tenantIds.length === 0) return [];
  const result = await client.query<{ owner_ids: string[]; tenant_id: string }>(
    `SELECT
       source.tenant_id::text AS tenant_id,
       COALESCE(
         array_agg(membership.user_id::text ORDER BY membership.user_id)
           FILTER (WHERE membership.user_id IS NOT NULL),
         ARRAY[]::text[]
       ) AS owner_ids
     FROM unnest($1::uuid[]) AS source(tenant_id)
     LEFT JOIN tenant_memberships AS membership
       ON membership.tenant_id = source.tenant_id
      AND membership.role_key = 'tenant_owner'
      AND membership.status = 'active'
     GROUP BY source.tenant_id`,
    [tenantIds],
  );
  return result.rows.map((row) => ({
    ownerIds: row.owner_ids.filter((ownerId): ownerId is string => Boolean(ownerId)),
    tenantId: row.tenant_id,
  }));
}

async function getMigratedSourceCredits(client: PoolClient, sourceGrantId: string): Promise<number | null> {
  const result = await client.query<{ amount_credits: string }>(
    `SELECT amount_credits::text AS amount_credits
     FROM billing_wallet_ledger
     WHERE entry_type = 'migration_credit'
       AND idempotency_key = $1
     LIMIT 1`,
    [`migration:tenant-grant:${sourceGrantId}`],
  );
  return result.rows[0] ? asNumber(result.rows[0].amount_credits) : null;
}

async function migrateSourceGrant(
  client: PoolClient,
  ownerId: string,
  source: SourceGrant,
): Promise<boolean> {
  const idempotencyKey = `migration:tenant-grant:${source.id}`;
  if ((await getMigratedSourceCredits(client, source.id)) !== null) return false;

  const wallet = await client.query<{ id: string }>(
    `INSERT INTO billing_wallets (user_id)
     VALUES ($1::uuid)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
     RETURNING id::text AS id`,
    [ownerId],
  );
  const walletId = wallet.rows[0]?.id;
  if (!walletId) throw new Error("PERSONAL_WALLET_MIGRATION_WALLET_CREATE_FAILED");

  const metadata = {
    migrationSourceGrantId: source.id,
    migrationTenantId: source.tenantId,
    migrationIdempotencyKey: idempotencyKey,
  };
  const grant = await client.query<{ id: string }>(
    `INSERT INTO billing_wallet_credit_grants (
       wallet_id, user_id, source_type, source_id,
       original_credits, remaining_credits, expires_at, metadata
     ) VALUES (
       $1::uuid, $2::uuid, 'migration', $3,
       $4::numeric, $4::numeric, $5::timestamptz, $6::jsonb
     ) RETURNING id::text AS id`,
    [walletId, ownerId, idempotencyKey, source.availableCredits, source.expiresAt, JSON.stringify(metadata)],
  );
  if (!grant.rows[0]?.id) throw new Error("PERSONAL_WALLET_MIGRATION_GRANT_CREATE_FAILED");

  await client.query(
    `UPDATE billing_wallets
     SET balance_credits = balance_credits + $2::numeric, updated_at = now()
     WHERE id = $1::uuid`,
    [walletId, source.availableCredits],
  );
  await client.query(
    `INSERT INTO billing_wallet_ledger (
       wallet_id, user_id, tenant_id, entry_type, amount_credits, idempotency_key, metadata
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'migration_credit', $4::numeric, $5, $6::jsonb)`,
    [walletId, ownerId, source.tenantId, source.availableCredits, idempotencyKey, JSON.stringify(metadata)],
  );
  return true;
}

export async function migrateTenantBalancesToPersonalWallets(
  pool: Pool,
  options: { dryRun: boolean },
): Promise<PersonalWalletMigrationReport> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await setSystemAdmin(client);
    if (!options.dryRun) {
      await client.query(
        "LOCK TABLE billing_credit_grants, billing_credit_reservations, tenant_memberships IN SHARE ROW EXCLUSIVE MODE",
      );
    }

    const [activeReservationCount, sourceGrants] = await Promise.all([
      getActiveReservationCount(client),
      getSourceGrants(client),
    ]);
    const owners = new Map(
      (await getTenantOwners(client, [...new Set(sourceGrants.map((grant) => grant.tenantId))]))
        .map((owner) => [owner.tenantId, owner.ownerIds]),
    );
    const unresolvedTenants: PersonalWalletMigrationReport["unresolvedTenants"] = [];
    const ownerByTenant = new Map<string, string>();
    for (const tenantId of [...owners.keys()].sort()) {
      const ownerIds = owners.get(tenantId) ?? [];
      if (ownerIds.length === 1) ownerByTenant.set(tenantId, ownerIds[0]!);
      else unresolvedTenants.push({
        reason: ownerIds.length === 0 ? "missing_owner" : "ambiguous_owner",
        tenantId,
      });
    }

    const sourceAvailableCredits = sum(sourceGrants.map((grant) => grant.availableCredits));
    const eligible = sourceGrants.filter((grant) => ownerByTenant.has(grant.tenantId));
    const pending: SourceGrant[] = [];
    const existingSourceCredits: number[] = [];
    for (const grant of eligible) {
      const existingCredits = await getMigratedSourceCredits(client, grant.id);
      if (existingCredits === null) pending.push(grant);
      else existingSourceCredits.push(existingCredits);
    }
    const blocked = activeReservationCount > 0 || unresolvedTenants.length > 0;
    const migratedCredits = !options.dryRun && blocked
      ? 0
      : sum(pending.map((grant) => grant.availableCredits));
    const migratedGrantCount = !options.dryRun && blocked ? 0 : pending.length;

    if (!options.dryRun && !blocked) {
      for (const source of pending) {
        const ownerId = ownerByTenant.get(source.tenantId);
        if (!ownerId) throw new Error("PERSONAL_WALLET_MIGRATION_OWNER_NOT_FOUND");
        await migrateSourceGrant(client, ownerId, source);
      }
    }

    const migratedTotal = sum([
      ...existingSourceCredits,
      ...(blocked && !options.dryRun ? [] : pending.map((grant) => grant.availableCredits)),
    ]);
    const verificationMatched = !blocked && migratedTotal === sourceAvailableCredits;
    const report: PersonalWalletMigrationReport = {
      activeReservationCount,
      dryRun: options.dryRun,
      migratedCredits,
      migratedGrantCount,
      sourceAvailableCredits,
      unresolvedTenants,
      verificationMatched,
    };
    await client.query(options.dryRun ? "ROLLBACK" : "COMMIT");
    return report;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
