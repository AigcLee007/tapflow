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
    expect(queue.add).toHaveBeenNthCalledWith(1, "prepare-reference-720p", { assetId: "asset-pending", tenantId: "tenant-1" }, expect.objectContaining({ jobId: "asset-pending:reference-720p" }));
    expect(queue.add).toHaveBeenNthCalledWith(2, "prepare-reference-720p", { assetId: "asset-legacy", tenantId: "tenant-2" }, expect.objectContaining({ jobId: "asset-legacy:reference-720p" }));
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("referenceVideoVariantStatus"), ["asset-pending", "tenant-1"]);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("referenceVideoVariantStatus"), ["asset-legacy", "tenant-2"]);
  });
});
