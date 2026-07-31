import { describe, expect, test } from "vitest";

import type { BillingLedgerEntry, BillingUsageEvent } from "./billingApi";
import {
  buildBillingActivityRows,
  buildBillingDisplayCatalog,
  type BillingDisplayCatalog,
} from "./billingActivity";

function createCatalog(): BillingDisplayCatalog {
  return buildBillingDisplayCatalog(
    [
      {
        capabilities: {},
        defaultRouteKey: "image.pixellelabs.nano-banana-pro",
        displayName: "Nano Banana Pro",
        id: "catalog-model-1",
        modality: "image",
        modelFamily: "pixellelabs.nano-banana-pro",
        modelId: "1911c771-74a1-4ca1-af77-df9383dd8304",
        modelKey: "pixellelabs.nano-banana-pro",
        sortOrder: 1,
        status: "active",
        uiSchema: {},
      },
    ],
    [
      {
        estimatedCredits: 3.2,
        minChargeCredits: 3.2,
        modality: "image",
        modelFamily: "pixellelabs.nano-banana-pro",
        modelKey: "pixellelabs.nano-banana-pro",
        pricingUnit: "image_generation",
        providerKey: "pixellelabs",
        providerName: "PixelleLabs",
        routeId: "route-1",
        routeKey: "image.pixellelabs.nano-banana-pro",
        routeLabel: "\u7ebf\u8def\u4e00",
      },
    ],
  );
}

describe("billingActivity", () => {
  test("builds a single creator-facing activity feed without reserve duplicates", () => {
    const usage: BillingUsageEvent[] = [
      {
        billableCents: 12.8,
        createdAt: "2026-06-19T02:28:08.000Z",
        eventType: "workbench.image.generate",
        id: "usage-1",
        idempotencyKey: "workbench:usage:tenant:generation",
        metadata: {},
        modality: "image",
        modelId: "1911c771-74a1-4ca1-af77-df9383dd8304",
        nodeRunId: null,
        rawCost: null,
        routeId: "route-1",
        status: "settled",
        unitType: "image_generation",
        units: "4",
        workflowRunId: "workflow-run-1",
      },
    ];

    const ledger: BillingLedgerEntry[] = [
      {
        amountCredits: 12.8,
        createdAt: "2026-06-19T02:24:32.000Z",
        entryType: "reserve",
        id: "ledger-reserve-1",
        idempotencyKey: "reserve:tenant:run:node",
        metadata: {},
        tenantId: null,
        usageEventId: null,
        userId: "user-1",
        walletId: "wallet-1",
      },
      {
        amountCredits: 12.8,
        createdAt: "2026-06-19T02:28:08.000Z",
        entryType: "settle",
        id: "ledger-settle-1",
        idempotencyKey: "settle:tenant:run:node",
        metadata: {},
        tenantId: null,
        usageEventId: "usage-1",
        userId: "user-1",
        walletId: "wallet-1",
      },
      {
        amountCredits: 100,
        createdAt: "2026-06-18T10:00:00.000Z",
        entryType: "admin_credit",
        id: "ledger-credit-1",
        idempotencyKey: "admin-credit-1",
        metadata: {},
        tenantId: null,
        usageEventId: null,
        userId: "user-1",
        walletId: "wallet-1",
      },
    ];

    const rows = buildBillingActivityRows(usage, ledger, createCatalog());

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      credits: -12.8,
      eventLabel: "\u56fe\u7247\u751f\u6210",
      modelLabel: "Nano Banana Pro \u7ebf\u8def\u4e00",
      quantityLabel: "4",
      statusLabel: "\u5df2\u7ed3\u7b97",
    });
    expect(rows[1]).toMatchObject({
      credits: 100,
      eventLabel: "\u540e\u53f0\u53d1\u653e",
      modelLabel: "-",
      quantityLabel: "-",
      statusLabel: "\u5df2\u5165\u8d26",
    });
  });

  test("maps technical model identifiers to creator-facing labels", () => {
    const usage: BillingUsageEvent[] = [
      {
        billableCents: 3.2,
        createdAt: "2026-06-19T02:18:54.000Z",
        eventType: "workbench.image.generate",
        id: "usage-2",
        idempotencyKey: "workbench:usage:tenant:generation-2",
        metadata: {},
        modality: "image",
        modelId: "pixellelabs.nano-banana-pro",
        nodeRunId: null,
        rawCost: null,
        routeId: null,
        status: "settled",
        unitType: "image_generation",
        units: "1",
        workflowRunId: "workflow-run-2",
      },
    ];

    const rows = buildBillingActivityRows(usage, [], createCatalog());

    expect(rows[0]?.modelLabel).toBe("Nano Banana Pro");
    expect(rows[0]?.modelLabel).not.toContain("pixellelabs.nano-banana-pro");
    expect(rows[0]?.modelLabel).not.toContain("1911c771-74a1-4ca1-af77-df9383dd8304");
  });

  test("labels personal wallet credit, expiry, and refund ledger entries", () => {
    const ledger: BillingLedgerEntry[] = [
      { amountCredits: 100, createdAt: "2026-06-19T03:00:00.000Z", entryType: "migration_credit", id: "migration", idempotencyKey: "migration:1", metadata: {}, tenantId: null, usageEventId: null, userId: "user-1", walletId: "wallet-1" },
      { amountCredits: 20, createdAt: "2026-06-19T02:00:00.000Z", entryType: "expire", id: "expire", idempotencyKey: "expire:1", metadata: {}, tenantId: null, usageEventId: null, userId: "user-1", walletId: "wallet-1" },
      { amountCredits: 100, createdAt: "2026-06-19T01:00:00.000Z", entryType: "payment_refund", id: "refund", idempotencyKey: "refund:1", metadata: {}, tenantId: null, usageEventId: null, userId: "user-1", walletId: "wallet-1" },
    ];

    expect(buildBillingActivityRows([], ledger, createCatalog()).map(({ credits, eventLabel }) => ({ credits, eventLabel }))).toEqual([
      { credits: 100, eventLabel: "\u5386\u53f2\u4f59\u989d\u8fc1\u79fb" },
      { credits: -20, eventLabel: "\u79ef\u5206\u8fc7\u671f" },
      { credits: -100, eventLabel: "\u5145\u503c\u9000\u6b3e" },
    ]);
  });

  test("uses the personal-wallet amountCredits field for recharge activity", () => {
    const ledger: BillingLedgerEntry[] = [{
      amountCredits: 700,
      createdAt: "2026-07-31T00:30:49.000Z",
      entryType: "payment",
      id: "payment",
      idempotencyKey: "payment:1",
      metadata: {},
      tenantId: null,
      usageEventId: null,
      userId: "user-1",
      walletId: "wallet-1",
    }];

    expect(buildBillingActivityRows([], ledger, createCatalog())[0]?.credits).toBe(700);
  });

  test("localizes agent activity labels", () => {
    const agentUsage: BillingUsageEvent = {
      billableCents: 1,
      createdAt: "2026-07-31T01:00:00.000Z",
      eventType: "agent.run",
      id: "usage-agent-1",
      idempotencyKey: "agent:usage:1",
      metadata: {},
      modality: "agent",
      modelId: null,
      nodeRunId: null,
      rawCost: null,
      routeId: null,
      status: "settled",
      unitType: null,
      units: "1",
      workflowRunId: null,
    };

    expect(buildBillingActivityRows([agentUsage], [], createCatalog())[0]?.eventLabel).toBe("智能体任务");
  });
});
