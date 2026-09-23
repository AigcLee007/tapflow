import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const migrationsDir = path.resolve(import.meta.dirname, "../migrations");

describe("platform bootstrap repair migrations", () => {
  test("uses new migration versions and leaves deployed migrations immutable", async () => {
    const [oldMigration, helper, replacement, cleanup] = await Promise.all([
      readFile(path.join(migrationsDir, "000086_platform_access.sql"), "utf8"),
      readFile(path.join(migrationsDir, "000101_platform_bootstrap_target_helper.sql"), "utf8"),
      readFile(path.join(migrationsDir, "000102_platform_bootstrap_target_check.sql"), "utf8"),
      readFile(path.join(migrationsDir, "000103_platform_bootstrap_target_helper_acl.sql"), "utf8"),
    ]);

    expect(oldMigration).toContain("PERFORM 1 FROM users WHERE id = p_user_id");
    expect(helper).toContain("CREATE OR REPLACE FUNCTION app.bootstrap_platform_target_user");
    expect(helper).toContain("FOR UPDATE");
    expect(replacement).toContain("PERFORM app.bootstrap_platform_target_user(p_user_id)");
    expect(replacement).toContain("SET LOCAL ROLE");
    expect(cleanup).toContain("REVOKE %I FROM %I");
  });
});
