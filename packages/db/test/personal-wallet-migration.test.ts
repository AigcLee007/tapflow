import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";

import {
  createPgPool,
  migrateTenantBalancesToPersonalWallets,
} from "../src/index.js";
import { runMigrations } from "../src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "./helpers.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

afterAll(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

test("exports the tenant-credit migration entrypoint", () => {
  expect(migrateTenantBalancesToPersonalWallets).toBeTypeOf("function");
});

test("dry-run-only migration reports candidate grants without issuing wallet writes", async () => {
  const queries: string[] = [];
  const client = {
    query: async (query: string) => {
      queries.push(query);
      if (query.includes("COUNT(*)::text AS count")) return { rows: [{ count: "0" }] };
      if (query.includes("GREATEST(remaining_credits - reserved_credits")) {
        return { rows: [{ available_credits: "12.5", expires_at: null, id: "grant-a", tenant_id: "tenant-a" }] };
      }
      if (query.includes("array_agg(membership.user_id")) return { rows: [{ owner_ids: ["owner-a"], tenant_id: "tenant-a" }] };
      if (query.includes("FROM billing_wallet_ledger")) return { rows: [] };
      return { rows: [] };
    },
    release: () => {},
  };
  const pool = { connect: async () => client };

  await expect(migrateTenantBalancesToPersonalWallets(pool as never, { dryRun: true })).resolves.toEqual({
    activeReservationCount: 0,
    dryRun: true,
    migratedCredits: 12.5,
    migratedGrantCount: 1,
    sourceAvailableCredits: 12.5,
    unresolvedTenants: [],
    verificationMatched: true,
  });
  expect(queries.some((query) => /INSERT INTO billing_wallet|UPDATE billing_wallets|LOCK TABLE/.test(query))).toBe(false);
  expect(queries.at(-1)).toContain("ROLLBACK");
});

type GrantFixture = {
  expiresAt?: string | null;
  remainingCredits: number;
  reservedCredits?: number;
  tenantId: string;
};

async function seedTenant(pool: ReturnType<typeof createPgPool>, input: {
  ownerIds: string[];
  slug: string;
  tenantId: string;
}) {
  await pool.query(
    "INSERT INTO tenants (id, name, slug) VALUES ($1::uuid, $2, $3)",
    [input.tenantId, input.slug, input.slug],
  );
  for (const [index, ownerId] of input.ownerIds.entries()) {
    await pool.query(
      `INSERT INTO users (id, email) VALUES ($1::uuid, $2)
       ON CONFLICT (id) DO NOTHING`,
      [ownerId, `${input.slug}-owner-${index}@example.com`],
    );
    await pool.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at)
       VALUES ($1::uuid, $2::uuid, 'tenant_owner', 'active', now())`,
      [input.tenantId, ownerId],
    );
  }
}

async function seedSourceGrant(pool: ReturnType<typeof createPgPool>, input: GrantFixture): Promise<string> {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO billing_accounts (tenant_id, currency)
     VALUES ($1::uuid, 'CNY')
     ON CONFLICT (tenant_id) DO UPDATE SET updated_at = now()
     RETURNING id::text AS id`,
    [input.tenantId],
  );
  const result = await pool.query<{ id: string }>(
    `INSERT INTO billing_credit_grants (
       tenant_id, billing_account_id, source_type, source_id,
       original_credits, remaining_credits, reserved_credits, expires_at, status
     ) VALUES ($1::uuid, $2::uuid, 'admin_grant', $3,
       $4, $5, $6, $7::timestamptz, 'active')
     RETURNING id::text AS id`,
    [
      input.tenantId,
      account.rows[0]!.id,
      `fixture:${randomUUID()}`,
      input.remainingCredits + (input.reservedCredits ?? 0),
      input.remainingCredits,
      input.reservedCredits ?? 0,
      input.expiresAt ?? null,
    ],
  );
  return result.rows[0]!.id;
}

describeWithDatabase("personal wallet tenant-credit migration", () => {
  test("dry run reports owner-resolved available grants without writing and write mode preserves expiry idempotently", async () => {
    await withDatabase(async ({ databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const pool = createPgPool();
      const ownerId = randomUUID();
      const tenantA = randomUUID();
      const tenantB = randomUUID();
      const finiteExpiry = "2030-06-01T00:00:00.000Z";

      try {
        await runMigrations(pool);
        await seedTenant(pool, { ownerIds: [ownerId], slug: "migration-a", tenantId: tenantA });
        await seedTenant(pool, { ownerIds: [ownerId], slug: "migration-b", tenantId: tenantB });
        await seedSourceGrant(pool, { tenantId: tenantA, remainingCredits: 40, expiresAt: finiteExpiry });
        await seedSourceGrant(pool, { tenantId: tenantA, remainingCredits: 10, expiresAt: null });
        await seedSourceGrant(pool, { tenantId: tenantB, remainingCredits: 8, expiresAt: "2000-01-01T00:00:00.000Z" });

        const dryRun = await migrateTenantBalancesToPersonalWallets(pool, { dryRun: true });
        expect(dryRun).toEqual({
          activeReservationCount: 0,
          dryRun: true,
          migratedCredits: 50,
          migratedGrantCount: 2,
          sourceAvailableCredits: 50,
          unresolvedTenants: [],
          verificationMatched: true,
        });
        expect((await pool.query("SELECT * FROM billing_wallet_credit_grants")).rows).toHaveLength(0);

        const firstWrite = await migrateTenantBalancesToPersonalWallets(pool, { dryRun: false });
        expect(firstWrite).toMatchObject({
          dryRun: false,
          migratedCredits: 50,
          migratedGrantCount: 2,
          sourceAvailableCredits: 50,
          verificationMatched: true,
        });
        const migrated = await pool.query<{ expires_at: string | null; remaining_credits: string }>(
          `SELECT expires_at::text, remaining_credits::text
           FROM billing_wallet_credit_grants ORDER BY expires_at NULLS LAST`,
        );
        expect(migrated.rows).toHaveLength(2);
        expect(migrated.rows[0]?.remaining_credits).toBe("40.0000");
        expect(new Date(migrated.rows[0]?.expires_at ?? "").toISOString()).toBe(finiteExpiry);
        expect(migrated.rows[1]).toEqual({ expires_at: null, remaining_credits: "10.0000" });

        const repeatWrite = await migrateTenantBalancesToPersonalWallets(pool, { dryRun: false });
        expect(repeatWrite).toEqual({
          activeReservationCount: 0,
          dryRun: false,
          migratedCredits: 0,
          migratedGrantCount: 0,
          sourceAvailableCredits: 50,
          unresolvedTenants: [],
          verificationMatched: true,
        });
        expect((await pool.query("SELECT * FROM billing_wallet_ledger")).rows).toHaveLength(2);
      } finally {
        await pool.end();
      }
    });
  });

  test("write mode aborts globally for active reservations or unresolved owners", async () => {
    await withDatabase(async ({ databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const pool = createPgPool();
      const ownerId = randomUUID();
      const safeTenant = randomUUID();
      const missingOwnerTenant = randomUUID();
      const ambiguousTenant = randomUUID();

      try {
        await runMigrations(pool);
        await seedTenant(pool, { ownerIds: [ownerId], slug: "migration-safe", tenantId: safeTenant });
        await seedTenant(pool, { ownerIds: [], slug: "migration-missing", tenantId: missingOwnerTenant });
        await seedTenant(pool, { ownerIds: [randomUUID(), randomUUID()], slug: "migration-ambiguous", tenantId: ambiguousTenant });
        const reservedGrantId = await seedSourceGrant(pool, { tenantId: safeTenant, remainingCredits: 7, reservedCredits: 3 });
        await seedSourceGrant(pool, { tenantId: missingOwnerTenant, remainingCredits: 4 });
        await seedSourceGrant(pool, { tenantId: ambiguousTenant, remainingCredits: 5 });
        const account = await pool.query<{ id: string }>("SELECT id::text AS id FROM billing_accounts WHERE tenant_id = $1::uuid", [safeTenant]);
        const ledger = await pool.query<{ id: string }>(
          `INSERT INTO billing_ledger (tenant_id, billing_account_id, entry_type, amount_cents, idempotency_key)
           VALUES ($1::uuid, $2::uuid, 'reserve', -3, $3) RETURNING id::text AS id`,
          [safeTenant, account.rows[0]!.id, `fixture-reservation:${randomUUID()}`],
        );
        await pool.query(
          `INSERT INTO billing_credit_reservations (tenant_id, billing_ledger_id, credit_grant_id, amount_credits, status)
           VALUES ($1::uuid, $2::uuid, $3::uuid, 3, 'reserved')`,
          [safeTenant, ledger.rows[0]!.id, reservedGrantId],
        );

        const report = await migrateTenantBalancesToPersonalWallets(pool, { dryRun: true });
        expect(report).toMatchObject({
          activeReservationCount: 1,
          dryRun: true,
          sourceAvailableCredits: 13,
          migratedCredits: 4,
          migratedGrantCount: 1,
          verificationMatched: false,
        });
        expect(report.unresolvedTenants).toEqual([
          { reason: "ambiguous_owner", tenantId: ambiguousTenant },
          { reason: "missing_owner", tenantId: missingOwnerTenant },
        ]);
        const blockedWrite = await migrateTenantBalancesToPersonalWallets(pool, { dryRun: false });
        expect(blockedWrite).toMatchObject({
          activeReservationCount: 1,
          dryRun: false,
          verificationMatched: false,
        });
        expect((await pool.query("SELECT * FROM billing_wallet_credit_grants")).rows).toHaveLength(0);
      } finally {
        await pool.end();
      }
    });
  });
});
