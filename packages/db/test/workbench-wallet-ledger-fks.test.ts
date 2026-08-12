import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.resolve(
  import.meta.dirname,
  "../migrations/000067_workbench_personal_wallet_ledger_fks.sql",
);

describe("workbench personal wallet ledger foreign key migration", () => {
  test("repoints reserve, settle, and refund references to the personal wallet ledger", async () => {
    const sql = await readFile(migrationPath, "utf8");

    for (const constraint of [
      "workbench_generations_reserve_ledger_id_fkey",
      "workbench_generations_settle_ledger_id_fkey",
      "workbench_generations_refund_ledger_id_fkey",
    ]) {
      expect(sql).toContain(`DROP CONSTRAINT IF EXISTS ${constraint}`);
    }

    expect(sql).toMatch(
      /reserve_ledger_id[^;]+REFERENCES billing_wallet_ledger\s*\(id\)[^;]+ON DELETE SET NULL[^;]+NOT VALID/s,
    );
    expect(sql).toMatch(
      /settle_ledger_id[^;]+REFERENCES billing_wallet_ledger\s*\(id\)[^;]+ON DELETE SET NULL[^;]+NOT VALID/s,
    );
    expect(sql).toMatch(
      /refund_ledger_id[^;]+REFERENCES billing_wallet_ledger\s*\(id\)[^;]+ON DELETE SET NULL[^;]+NOT VALID/s,
    );
    expect(sql).not.toMatch(/workbench_generations_[a-z]+_ledger_id_fkey[^\n]*billing_ledger\s*\(id\)/);
  });
});
