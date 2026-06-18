import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

describe("000029_single_creator_billing.sql", () => {
  test("does not use reserved GRANT keyword as a table alias", async () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../migrations/000029_single_creator_billing.sql",
    );
    const sql = await readFile(migrationPath, "utf8");

    expect(sql.toLowerCase()).not.toContain("from billing_credit_grants as grant");
    expect(sql.toLowerCase()).toContain("from billing_credit_grants as credit_grant");
  });
});
