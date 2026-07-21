import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("prompt local media migration", () => {
  test("drops the legacy asset primary key before making asset_id nullable", () => {
    const migration = readFileSync(
      join(process.cwd(), "migrations", "000040_prompt_catalog_local_media.sql"),
      "utf8",
    );

    const dropPrimaryKey = migration.indexOf("DROP CONSTRAINT IF EXISTS prompt_entry_media_pkey");
    const dropAssetNotNull = migration.indexOf("ALTER COLUMN asset_id DROP NOT NULL");

    expect(dropPrimaryKey).toBeGreaterThan(-1);
    expect(dropAssetNotNull).toBeGreaterThan(-1);
    expect(dropPrimaryKey).toBeLessThan(dropAssetNotNull);
  });
});
