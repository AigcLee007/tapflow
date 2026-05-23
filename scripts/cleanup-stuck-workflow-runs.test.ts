import { describe, expect, it } from "vitest";

import {
  buildCleanupError,
  NODE_RUN_APPLY_UPDATE_SQL,
  parseCleanupArgs,
  readReservedCents,
  shouldRefund,
  WORKFLOW_RUN_APPLY_UPDATE_SQL,
} from "./cleanup-stuck-workflow-runs.js";

function referencedParameterNumbers(sql: string): number[] {
  return Array.from(sql.matchAll(/\$(\d+)/g), (match) => Number(match[1]));
}

describe("cleanup-stuck-workflow-runs helpers", () => {
  it("defaults to dry-run and parses bounded cleanup args", () => {
    const args = parseCleanupArgs([
      "--tenant-id",
      "tenant-1",
      "--after",
      "2026-05-22T17:00:00Z",
      "--before",
      "2026-05-22T17:30:00Z",
      "--reason",
      "queue outage",
    ]);

    expect(args).toMatchObject({
      after: "2026-05-22T17:00:00Z",
      apply: false,
      before: "2026-05-22T17:30:00Z",
      reason: "queue outage",
      tenantId: "tenant-1",
    });
  });

  it("marks cleanup error with stable code and timestamp", () => {
    expect(buildCleanupError("quota exceeded", new Date("2026-05-22T17:15:00Z"))).toEqual({
      cleanedAt: "2026-05-22T17:15:00.000Z",
      code: "QUEUE_ENQUEUE_FAILED_OR_STALE_RUN",
      reason: "quota exceeded",
    });
  });

  it("only refunds active reserved costs", () => {
    expect(readReservedCents({ reservedCents: 120 })).toBe(120);
    expect(shouldRefund({ reservedCents: 120, reserveStatus: "reserved" })).toBe(true);
    expect(shouldRefund({ reservedCents: 120, reserveStatus: "settled" })).toBe(false);
    expect(shouldRefund({ reservedCents: 0, reserveStatus: "reserved" })).toBe(false);
  });

  it("apply update SQL uses only provided typed parameters", () => {
    expect(referencedParameterNumbers(NODE_RUN_APPLY_UPDATE_SQL).sort()).toEqual([1, 2, 3]);
    expect(NODE_RUN_APPLY_UPDATE_SQL).toContain("$1::uuid[]");
    expect(NODE_RUN_APPLY_UPDATE_SQL).toContain("$2::uuid");
    expect(NODE_RUN_APPLY_UPDATE_SQL).toContain("$3::jsonb");
    expect(NODE_RUN_APPLY_UPDATE_SQL).not.toContain("$4");

    expect(referencedParameterNumbers(WORKFLOW_RUN_APPLY_UPDATE_SQL).sort()).toEqual([1, 2, 3]);
    expect(WORKFLOW_RUN_APPLY_UPDATE_SQL).toContain("$1::uuid[]");
    expect(WORKFLOW_RUN_APPLY_UPDATE_SQL).toContain("$2::uuid");
    expect(WORKFLOW_RUN_APPLY_UPDATE_SQL).toContain("$3::jsonb");
  });
});
