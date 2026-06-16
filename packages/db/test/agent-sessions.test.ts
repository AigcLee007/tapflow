import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";

import { createPgPool, withTenantTransaction } from "../src/index.js";
import { runMigrations } from "../src/migrator.js";
import { hasDatabaseEnv, withAppContextTransaction, withDatabase } from "./helpers.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

afterAll(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describeWithDatabase("agent sessions migration and RLS", () => {
  test("isolates agent sessions by tenant", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      const tenantA = randomUUID();
      const tenantB = randomUUID();
      const userA = randomUUID();
      const userB = randomUUID();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });

        const created = await withTenantTransaction({ tenantId: tenantA, userId: userA }, async (client) => {
          await client.query(
            `INSERT INTO users (id, email, display_name) VALUES ($1::uuid, $2, $3)`,
            [userA, "agent-a@example.com", "Agent A"],
          );
          await client.query(
            `INSERT INTO tenants (id, name, slug, updated_at) VALUES ($1::uuid, 'Agent Tenant A', 'agent-tenant-a', now())`,
            [tenantA],
          );
          await client.query(
            `INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at, updated_at)
             VALUES ($1::uuid, $2::uuid, 'tenant_owner', 'active', now(), now())`,
            [tenantA, userA],
          );
          const result = await client.query<{ id: string }>(
            `INSERT INTO agent_sessions (tenant_id, project_id, flow_id, created_by, title)
             VALUES ($1::uuid, NULL, NULL, $2::uuid, 'Test Agent')
             RETURNING id::text AS id`,
            [tenantA, userA],
          );
          return result.rows[0]!;
        }, adminPool);

        await withTenantTransaction({ tenantId: tenantB, userId: userB }, async (client) => {
          await client.query(
            `INSERT INTO users (id, email, display_name) VALUES ($1::uuid, $2, $3)`,
            [userB, "agent-b@example.com", "Agent B"],
          );
          await client.query(
            `INSERT INTO tenants (id, name, slug, updated_at) VALUES ($1::uuid, 'Agent Tenant B', 'agent-tenant-b', now())`,
            [tenantB],
          );
          await client.query(
            `INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at, updated_at)
             VALUES ($1::uuid, $2::uuid, 'tenant_owner', 'active', now(), now())`,
            [tenantB, userB],
          );
        }, adminPool);

        const tenantAVisible = await withAppContextTransaction(
          appPool,
          { tenantId: tenantA, userId: userA },
          async (client) => {
            const result = await client.query(`SELECT id FROM agent_sessions WHERE id = $1::uuid`, [created.id]);
            return result.rowCount;
          },
        );

        const tenantBVisible = await withAppContextTransaction(
          appPool,
          { tenantId: tenantB, userId: userB },
          async (client) => {
            const result = await client.query(`SELECT id FROM agent_sessions WHERE id = $1::uuid`, [created.id]);
            return result.rowCount;
          },
        );

        expect(tenantAVisible).toBe(1);
        expect(tenantBVisible).toBe(0);
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
