import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("reference upload retention migrations", () => {
  test("sets temporary reference uploads to a seven day default ttl", () => {
    const migration = readFileSync(
      join(process.cwd(), "migrations", "000034_reference_uploads_seven_day_ttl.sql"),
      "utf8",
    );

    expect(migration).toContain("ALTER COLUMN expires_at SET DEFAULT now() + interval '7 days'");
    expect(migration).toContain("created_at + interval '7 days'");
  });
});
