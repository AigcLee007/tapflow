import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const moduleRoot = path.resolve(import.meta.dirname, "../src/modules");

describe("personal wallet charging cutover", () => {
  test("workflow cancellation refunds the persisted billing owner through its reserve ledger", async () => {
    const source = await readFile(path.join(moduleRoot, "workflow-runs/workflow-runs.service.ts"), "utf8");

    expect(source).toContain("SELECT billed_user_id::text AS billed_user_id FROM workflow_runs");
    expect(source).toContain("this.personalWalletService.refundUsageWithClient(client, { tenantId, userId: billedUserId }");
    expect(source).toContain("reserveLedgerId,");
    expect(source).not.toContain("this.billingService.refundUsageWithClient(client, tenantId");
  });

  test("workbench deletion refunds the generation billing owner through its reserve ledger", async () => {
    const source = await readFile(path.join(moduleRoot, "workbench/workbench.service.ts"), "utf8");

    expect(source).toContain("billed_user_id::text AS billed_user_id");
    expect(source).toContain("this.personalWalletService.refundUsageWithClient(client, { tenantId, userId: generation.billed_user_id }");
    expect(source).toContain("reserveLedgerId: generation.reserve_ledger_id");
    expect(source).not.toContain("this.billingService.refundUsageWithClient(client, tenantId");
  });
});
