import { describe, expect, it } from "vitest";
import { retryFailedGenerationItems, runGenerationBatch } from "../src/modules/agent/v4/agent-generation-orchestrator.js";

const item = (itemId: string, status: "queued" | "failed" = "queued") => ({ itemId, pageKey: itemId, prompt: itemId, referenceAssetIds: [], status });

describe("Agent V4 generation orchestrator", () => {
  it("runs independent items with bounded concurrency and stable keys", async () => {
    const seen: string[] = [];
    const result = await runGenerationBatch([item("a"), item("b"), item("c")], async (current, key) => { seen.push(`${current.itemId}:${key}`); return { assetId: `asset-${current.itemId}` }; }, { concurrency: 2 });
    expect(result.every((entry) => entry.status === "succeeded")).toBe(true);
    expect(seen).toContain("b:v4:item:b");
  });
  it("retries only failed items", async () => {
    const result = await retryFailedGenerationItems([item("ok"), item("bad", "failed")], async (current) => ({ assetId: `asset-${current.itemId}` }));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ itemId: "bad", status: "succeeded" });
  });
});
