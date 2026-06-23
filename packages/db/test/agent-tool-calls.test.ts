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

async function seedTenantWithAgentTurn(options: {
  adminPool: ReturnType<typeof createPgPool>;
  email: string;
  tenantId: string;
  tenantSlug: string;
  userId: string;
}) {
  return withTenantTransaction({ tenantId: options.tenantId, userId: options.userId }, async (client) => {
    await client.query(
      `INSERT INTO users (id, email, display_name) VALUES ($1::uuid, $2, $3)`,
      [options.userId, options.email, options.email],
    );
    await client.query(
      `INSERT INTO tenants (id, name, slug, updated_at) VALUES ($1::uuid, $2, $3, now())`,
      [options.tenantId, options.email, options.tenantSlug],
    );
    await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'tenant_owner', 'active', now(), now())`,
      [options.tenantId, options.userId],
    );
    const session = await client.query<{ id: string }>(
      `INSERT INTO agent_sessions (tenant_id, created_by, title)
       VALUES ($1::uuid, $2::uuid, 'Tool Executor')
       RETURNING id::text AS id`,
      [options.tenantId, options.userId],
    );
    const turn = await client.query<{ id: string }>(
      `INSERT INTO agent_turns (tenant_id, session_id, status, snapshot_json, plan_json)
       VALUES ($1::uuid, $2::uuid, 'planned', '{}'::jsonb, '{}'::jsonb)
       RETURNING id::text AS id`,
      [options.tenantId, session.rows[0]!.id],
    );
    return {
      sessionId: session.rows[0]!.id,
      turnId: turn.rows[0]!.id,
    };
  }, options.adminPool);
}

describeWithDatabase("agent tool calls executor migration and RLS", () => {
  test("adds executor fields and isolates tool calls by tenant", async () => {
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

        const tenantATurn = await seedTenantWithAgentTurn({
          adminPool,
          email: "agent-tool-a@example.com",
          tenantId: tenantA,
          tenantSlug: "agent-tool-a",
          userId: userA,
        });
        await seedTenantWithAgentTurn({
          adminPool,
          email: "agent-tool-b@example.com",
          tenantId: tenantB,
          tenantSlug: "agent-tool-b",
          userId: userB,
        });

        const created = await withTenantTransaction({ tenantId: tenantA, userId: userA }, async (client) => {
          const result = await client.query<{ id: string }>(
            `
              INSERT INTO agent_tool_calls (
                tenant_id,
                session_id,
                turn_id,
                tool_call_key,
                tool_name,
                status,
                arguments_json,
                result_json,
                error_json,
                cost_estimate_json,
                created_by
              )
              VALUES (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                'call_generate_base',
                'generate_image',
                'running',
                '{"prompt":"base visual"}'::jsonb,
                '{}'::jsonb,
                '{}'::jsonb,
                '{"totalCredits":4}'::jsonb,
                $4::uuid
              )
              RETURNING id::text AS id
            `,
            [tenantA, tenantATurn.sessionId, tenantATurn.turnId, userA],
          );
          return result.rows[0]!;
        }, adminPool);

        const tenantAVisible = await withAppContextTransaction(
          appPool,
          { tenantId: tenantA, userId: userA },
          async (client) => {
            const result = await client.query<{
              cost_estimate_json: { totalCredits?: number };
              status: string;
              tool_call_key: string;
            }>(
              `SELECT tool_call_key, status, cost_estimate_json FROM agent_tool_calls WHERE id = $1::uuid`,
              [created.id],
            );
            return result.rows[0];
          },
        );

        const tenantBVisible = await withAppContextTransaction(
          appPool,
          { tenantId: tenantB, userId: userB },
          async (client) => {
            const result = await client.query(`SELECT id FROM agent_tool_calls WHERE id = $1::uuid`, [created.id]);
            return result.rowCount;
          },
        );

        expect(tenantAVisible).toEqual({
          cost_estimate_json: { totalCredits: 4 },
          status: "running",
          tool_call_key: "call_generate_base",
        });
        expect(tenantBVisible).toBe(0);
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
