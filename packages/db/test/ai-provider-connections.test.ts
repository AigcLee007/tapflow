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

describeWithDatabase("ai provider connections migration and RLS", () => {
  test("creates ai_provider_connections table", async () => {
    await withDatabase(async ({ databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const pool = createPgPool();

      try {
        await runMigrations(pool);

        const tables = await pool.query<{ table_name: string }>(
          `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('ai_provider_connections')
          `,
        );

        expect(tables.rows.map((row) => row.table_name)).toEqual(["ai_provider_connections"]);
      } finally {
        await pool.end();
      }
    });
  });

  test("tenant RLS isolates provider connections", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      const tenantA = randomUUID();
      const tenantB = randomUUID();
      const userA = randomUUID();
      const userB = randomUUID();
      const providerId = randomUUID();
      const credentialA = randomUUID();
      const credentialB = randomUUID();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        await adminPool.query(
          `
            INSERT INTO ai_providers (id, key, name, kind)
            VALUES ($1::uuid, 'openai-compatible', 'OpenAI Compatible', 'openai-compatible')
          `,
          [providerId],
        );

        for (const [tenantId, userId, email, slug, credentialId, connectionName] of [
          [tenantA, userA, "conn-a@example.com", "conn-a", credentialA, "SiphonLab A"],
          [tenantB, userB, "conn-b@example.com", "conn-b", credentialB, "SiphonLab B"],
        ] as const) {
          await withTenantTransaction({ tenantId, userId }, async (client) => {
            await client.query(
              `
                INSERT INTO users (id, email, display_name)
                VALUES ($1::uuid, $2, $3)
              `,
              [userId, email, slug],
            );
            await client.query(
              `
                INSERT INTO tenants (id, name, slug, updated_at)
                VALUES ($1::uuid, $2, $3, now())
              `,
              [tenantId, slug, slug],
            );
            await client.query(
              `
                INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at, updated_at)
                VALUES ($1::uuid, $2::uuid, 'tenant_owner', 'active', now(), now())
              `,
              [tenantId, userId],
            );
            await client.query(
              `
                INSERT INTO api_credentials (
                  id,
                  tenant_id,
                  provider_id,
                  name,
                  encrypted_secret,
                  nonce,
                  auth_tag,
                  key_version,
                  secret_fingerprint,
                  created_by
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3::uuid,
                  $4,
                  $5::bytea,
                  $6::bytea,
                  $7::bytea,
                  'v1',
                  $8,
                  $9::uuid
                )
              `,
              [
                credentialId,
                tenantId,
                providerId,
                `${connectionName} Key`,
                Buffer.from(`secret-${slug}`),
                Buffer.from(`nonce-${slug}`),
                Buffer.from(`tag-${slug}`),
                `fingerprint-${slug}`,
                userId,
              ],
            );
            await client.query(
              `
                INSERT INTO ai_provider_connections (
                  tenant_id,
                  provider_id,
                  credential_id,
                  name,
                  adapter_kind,
                  base_url,
                  created_by
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3::uuid,
                  $4,
                  'openai-compatible',
                  $5,
                  $6::uuid
                )
              `,
              [tenantId, providerId, credentialId, connectionName, `https://${slug}.example.com/v1`, userId],
            );
          }, adminPool);
        }

        await withAppContextTransaction(appPool, { tenantId: tenantA, userId: userA }, async (client) => {
          const visible = await client.query<{ name: string }>(
            `
              SELECT name
              FROM ai_provider_connections
              ORDER BY name ASC
            `,
          );
          expect(visible.rows.map((row) => row.name)).toEqual(["SiphonLab A"]);
        });

        await withAppContextTransaction(appPool, { tenantId: tenantB, userId: userB }, async (client) => {
          const visible = await client.query<{ name: string }>(
            `
              SELECT name
              FROM ai_provider_connections
              ORDER BY name ASC
            `,
          );
          expect(visible.rows.map((row) => row.name)).toEqual(["SiphonLab B"]);
        });
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});

