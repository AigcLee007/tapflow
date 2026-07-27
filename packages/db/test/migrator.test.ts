import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Pool } from "pg";
import { afterAll, afterEach, describe, expect, test, vi } from "vitest";

import { createPgPool } from "../src/db.js";
import { runMigrations } from "../src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "./helpers.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const tempDirs: string[] = [];
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

afterAll(async () => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }

  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runMigrations client lifecycle", () => {
  test("handles a checked-out client error after a committed migration", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "aigc-flow-migration-client-"));
    tempDirs.push(tempDir);
    await writeFile(path.join(tempDir, "000001_test.sql"), "SELECT 1;\n", "utf8");

    const connectionError = Object.assign(new Error("Connection terminated unexpectedly"), {
      code: "ECONNRESET",
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const release = vi.fn();
    const client = Object.assign(new EventEmitter(), {
      query: vi.fn(async (sql: string) => {
        if (sql === "COMMIT") {
          client.emit("error", connectionError);
        }
        return { rows: [] };
      }),
      release,
    });
    const pool = {
      connect: vi.fn(async () => client),
      query: vi.fn(async () => ({ rows: [] })),
    } as unknown as Pool;

    await expect(runMigrations(pool, tempDir)).resolves.toEqual({
      appliedMigrations: ["000001_test.sql"],
      skippedMigrations: [],
    });
    expect(release).toHaveBeenCalledWith(connectionError);
    expect(consoleError).toHaveBeenCalledWith(
      "[db:migrate] checked-out PostgreSQL client error",
      expect.objectContaining({
        code: "ECONNRESET",
        message: "Connection terminated unexpectedly",
      }),
    );
  });
});

describeWithDatabase("runMigrations", () => {
  test("applies the extension and IAM migrations and records them once", async () => {
    await withDatabase(async ({ databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const pool = createPgPool();
      try {
        const firstRun = await runMigrations(pool);
        expect(firstRun.appliedMigrations).toEqual([
          "000001_extensions.sql",
          "000002_iam.sql",
          "000003_auth.sql",
          "000004_projects_flows.sql",
          "000005_assets.sql",
          "000006_ai_gateway.sql",
          "000007_workflow_runs.sql",
          "000008_billing.sql",
          "000009_audit_observability.sql",
        ]);
        expect(firstRun.skippedMigrations).toEqual([]);

        const migrations = await pool.query(
          `
            SELECT filename, checksum
            FROM schema_migrations
            ORDER BY version ASC
          `,
        );
        expect(migrations.rows).toHaveLength(9);
        expect(migrations.rows.map((row) => row.filename)).toEqual([
          "000001_extensions.sql",
          "000002_iam.sql",
          "000003_auth.sql",
          "000004_projects_flows.sql",
          "000005_assets.sql",
          "000006_ai_gateway.sql",
          "000007_workflow_runs.sql",
          "000008_billing.sql",
          "000009_audit_observability.sql",
        ]);
        for (const row of migrations.rows) {
          expect(row.checksum).toMatch(/^[a-f0-9]{64}$/);
        }

        const secondRun = await runMigrations(pool);
        expect(secondRun.appliedMigrations).toEqual([]);
        expect(secondRun.skippedMigrations).toEqual([
          "000001_extensions.sql",
          "000002_iam.sql",
          "000003_auth.sql",
          "000004_projects_flows.sql",
          "000005_assets.sql",
          "000006_ai_gateway.sql",
          "000007_workflow_runs.sql",
          "000008_billing.sql",
          "000009_audit_observability.sql",
        ]);

        const count = await pool.query("SELECT COUNT(*)::int AS total FROM schema_migrations");
        expect(count.rows[0]?.total).toBe(9);
      } finally {
        await pool.end();
      }
    });
  });

  test("surfaces the migration filename on failure and rolls back the failing migration", async () => {
    await withDatabase(async ({ databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "aigc-flow-migrations-"));
      tempDirs.push(tempDir);

      await writeFile(
        path.join(tempDir, "000001_extensions.sql"),
        "CREATE EXTENSION IF NOT EXISTS pgcrypto;\nCREATE EXTENSION IF NOT EXISTS citext;\n",
        "utf8",
      );
      await writeFile(
        path.join(tempDir, "000002_bad.sql"),
        "CREATE TABLE broken_sql (\n  id uuid primary key default gen_random_uuid()\n;\n",
        "utf8",
      );

      const pool = createPgPool();
      try {
        await expect(runMigrations(pool, tempDir)).rejects.toMatchObject({
          filename: "000002_bad.sql",
        });
        await expect(runMigrations(pool, tempDir)).rejects.toThrow("000002_bad.sql");

        const rows = await pool.query(
          "SELECT filename FROM schema_migrations ORDER BY version ASC",
        );
        expect(rows.rows.map((row) => row.filename)).toEqual(["000001_extensions.sql"]);

        const tableCheck = await pool.query(
          `
            SELECT EXISTS (
              SELECT 1
              FROM information_schema.tables
              WHERE table_schema = 'public'
                AND table_name = 'broken_sql'
            ) AS exists
          `,
        );
        expect(tableCheck.rows[0]?.exists).toBe(false);
      } finally {
        await pool.end();
      }
    });
  });
});
