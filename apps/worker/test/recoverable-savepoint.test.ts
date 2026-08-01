import { describe, expect, test } from "vitest";

import {
  createRecoverableSavepoint,
  rollbackToRecoverableSavepoint,
} from "../src/workflow-runtime/recoverable-savepoint.js";

describe("recoverable provider-poll savepoints", () => {
  test("rolls back an aborted statement before the failed-state write", async () => {
    const original = Object.assign(new Error("column reference user_id is ambiguous"), {
      code: "42702",
    });
    const queries: string[] = [];
    let aborted = false;
    const client = {
      async query(sql: string) {
        queries.push(sql);
        if (sql === "SELECT broken") {
          aborted = true;
          throw original;
        }
        if (sql.startsWith("ROLLBACK TO SAVEPOINT")) {
          aborted = false;
          return { rows: [] };
        }
        if (aborted) {
          throw Object.assign(new Error("current transaction is aborted"), { code: "25P02" });
        }
        return { rows: [] };
      },
    };

    await createRecoverableSavepoint(client as never, "provider_poll_attempt");
    await expect(client.query("SELECT broken")).rejects.toBe(original);
    await rollbackToRecoverableSavepoint(client as never, "provider_poll_attempt");
    await client.query("UPDATE workflow_runs SET status = 'failed'");

    expect(queries).toEqual([
      "SAVEPOINT provider_poll_attempt",
      "SELECT broken",
      "ROLLBACK TO SAVEPOINT provider_poll_attempt",
      "RELEASE SAVEPOINT provider_poll_attempt",
      "UPDATE workflow_runs SET status = 'failed'",
    ]);
  });
});
