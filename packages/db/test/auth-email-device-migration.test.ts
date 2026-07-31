import { readdir } from "node:fs/promises";
import path from "node:path";

import { afterAll, describe, expect, test } from "vitest";

import { createPgPool } from "../src/db.js";
import { runMigrations } from "../src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "./helpers.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

describe("auth email device migration version", () => {
  test("uses a globally unique numeric migration version", async () => {
    const migrationNames = (await readdir(path.resolve(import.meta.dirname, "../migrations")))
      .filter((filename) => filename.endsWith(".sql"));
    const versions = migrationNames.map((filename) => filename.match(/^(\d+)_/)?.[1]);

    expect(new Set(versions).size).toBe(versions.length);
  });
});

afterAll(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describeWithDatabase("000054_auth_email_device_verification.sql", () => {
  test("creates authentication email challenge and trusted device tables", async () => {
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
              AND table_name = ANY($1::text[])
            ORDER BY table_name ASC
          `,
          [["auth_email_challenges", "auth_trusted_devices"]],
        );

        expect(tables.rows.map((row) => row.table_name)).toEqual([
          "auth_email_challenges",
          "auth_trusted_devices",
        ]);

        const trustedDeviceColumns = await pool.query<{ column_name: string }>(
          `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'auth_trusted_devices'
            ORDER BY column_name ASC
          `,
        );
        const columnNames = trustedDeviceColumns.rows.map((row) => row.column_name);

        expect(columnNames).toContain("token_hash");
        expect(columnNames).not.toContain("tenant_id");
      } finally {
        await pool.end();
      }
    });
  });
});
