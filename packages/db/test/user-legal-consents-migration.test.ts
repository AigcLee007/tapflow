import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { afterAll, describe, expect, test } from "vitest";

import { createPgPool } from "../src/db.js";
import { runMigrations } from "../src/migrator.js";
import { hasDatabaseEnv, withAppContextTransaction, withDatabase } from "./helpers.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

describe("user legal consents migration version", () => {
  test("includes migration 000066", async () => {
    const migrationNames = await readdir(path.resolve(import.meta.dirname, "../migrations"));

    expect(migrationNames).toContain("000066_user_legal_consents.sql");
  });

  test("grants only read and insert to the migration runtime role", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000066_user_legal_consents.sql"),
      "utf8",
    );

    expect(sql).toContain("REVOKE ALL ON user_legal_consents FROM PUBLIC;");
    expect(sql).toContain("GRANT SELECT, INSERT ON user_legal_consents TO CURRENT_USER;");
  });
});

afterAll(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describeWithDatabase("000066_user_legal_consents.sql", () => {
  test("creates account-level immutable legal consent records", async () => {
    await withDatabase(async ({ databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const pool = createPgPool();

      try {
        await runMigrations(pool);

        const columns = await pool.query<{ column_name: string }>(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'user_legal_consents'
          ORDER BY column_name ASC
        `);
        const columnNames = columns.rows.map((row) => row.column_name);

        expect(columnNames).toEqual(expect.arrayContaining([
          "id", "user_id", "document_type", "document_version",
          "consented_at", "consent_source", "created_at",
        ]));
        expect(columnNames).not.toContain("tenant_id");

        const indexes = await pool.query<{ indexname: string }>(`
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'user_legal_consents'
        `);
        const indexNames = indexes.rows.map((row) => row.indexname);
        expect(indexNames).toContain("user_legal_consents_user_document_version_uidx");

        const policies = await pool.query<{ policyname: string }>(`
          SELECT policyname
          FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'user_legal_consents'
        `);
        const policyNames = policies.rows.map((row) => row.policyname);
        expect(policyNames).toContain("user_legal_consents_select_own");
        expect(policyNames).toContain("user_legal_consents_insert_own");

        const rls = await pool.query<{ relrowsecurity: boolean }>(`
          SELECT relrowsecurity
          FROM pg_class
          WHERE oid = 'public.user_legal_consents'::regclass
        `);
        expect(rls.rows[0]?.relrowsecurity).toBe(true);

        const user = await pool.query<{ id: string }>(`
          INSERT INTO users (email, password_hash)
          VALUES ('legal-consent@example.test', 'hash')
          RETURNING id
        `);
        const userId = user.rows[0]?.id;
        expect(userId).toBeTruthy();

        await withAppContextTransaction(pool, { userId }, async (client) => {
          await client.query(
            `INSERT INTO user_legal_consents (user_id, document_type, document_version, consent_source)
             VALUES ($1, 'terms', '2026-08-12', 'auth_register')`,
            [userId],
          );

          await client.query("SAVEPOINT duplicate_consent");
          await expect(client.query(
            `INSERT INTO user_legal_consents (user_id, document_type, document_version, consent_source)
             VALUES ($1, 'terms', '2026-08-12', 'auth_register')`,
            [userId],
          )).rejects.toMatchObject({ code: "23505" });
          await client.query("ROLLBACK TO SAVEPOINT duplicate_consent");
        });
      } finally {
        await pool.end();
      }
    });
  });
});
