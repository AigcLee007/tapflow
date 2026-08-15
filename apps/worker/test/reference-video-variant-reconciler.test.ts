import { describe, expect, test, vi } from "vitest";

import { ReferenceVideoVariantReconciler } from "../src/workflow-runtime/reference-video-variant-reconciler.js";

describe("ReferenceVideoVariantReconciler", () => {
  test("requeues pending and legacy video assets without touching failed assets", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [
          { asset_id: "asset-pending", tenant_id: "tenant-1" },
          { asset_id: "asset-legacy", tenant_id: "tenant-2" },
        ] })
        .mockResolvedValue({ rowCount: 1, rows: [] }),
    };
    const queue = { add: vi.fn().mockResolvedValue({}) };
    const reconciler = new ReferenceVideoVariantReconciler({ pool: pool as never, queue });

    const result = await reconciler.reconcile();

    expect(result).toBe(2);
    expect(queue.add).toHaveBeenNthCalledWith(1, "prepare-reference-720p", { assetId: "asset-pending", tenantId: "tenant-1" }, expect.objectContaining({ jobId: "reference-720p-asset-pending" }));
    expect(queue.add).toHaveBeenNthCalledWith(2, "prepare-reference-720p", { assetId: "asset-legacy", tenantId: "tenant-2" }, expect.objectContaining({ jobId: "reference-720p-asset-legacy" }));
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("referenceVideoVariantStatus"), ["asset-pending", "tenant-1"]);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("referenceVideoVariantStatus"), ["asset-legacy", "tenant-2"]);
  });

  test("logs a queue failure and continues reconciling later assets", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [
          { asset_id: "asset-pending", tenant_id: "tenant-1" },
          { asset_id: "asset-legacy", tenant_id: "tenant-2" },
        ] })
        .mockResolvedValue({ rowCount: 1, rows: [] }),
    };
    const logger = { error: vi.fn() };
    const queue = {
      add: vi.fn()
        .mockRejectedValueOnce(new Error("Redis unavailable"))
        .mockResolvedValueOnce({}),
    };
    const reconciler = new ReferenceVideoVariantReconciler({ logger, pool: pool as never, queue });

    await expect(reconciler.reconcile()).resolves.toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: "asset-pending", tenantId: "tenant-1" }),
      expect.stringContaining("reference video variant"),
    );
  });
});
