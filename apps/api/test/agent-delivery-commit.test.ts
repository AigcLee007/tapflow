import { describe, expect, it, vi } from "vitest";
import { commitV4Delivery, verifyV4Delivery } from "../src/modules/agent/v4/agent-delivery-commit.js";

describe("V4 delivery boundary", () => {
  it("requires terminal placement evidence and lineage", () => {
    expect(verifyV4Delivery({ tenantId: "t1", taskId: "task", flowId: "f1", expected: [{ id: "i1", kind: "image" }], actual: [{ id: "i1", kind: "image", status: "succeeded", assetId: "a1", nodeId: "n1", tenantId: "t1", flowId: "f1" }] }).status).toBe("verified");
    expect(verifyV4Delivery({ tenantId: "t1", taskId: "task", flowId: "f1", expected: [{ id: "i1", kind: "image" }], actual: [{ id: "i1", kind: "image", status: "succeeded", assetId: "a1", nodeId: "n1", tenantId: "t2", flowId: "f1" }] }).status).toBe("failed");
  });
  it("does not commit an unverified delivery", async () => {
    const service = { applyApprovedOperationSet: vi.fn() } as never;
    await expect(commitV4Delivery(service, { tenantId: "t1", projectId: "p1", flowId: "f1", taskId: "task", operationSet: {} as never, delivery: { status: "partial", items: [] } })).rejects.toThrow("AGENT_V4_DELIVERY_NOT_VERIFIED");
  });
});
