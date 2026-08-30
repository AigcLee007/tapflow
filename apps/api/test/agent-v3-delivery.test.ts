import { describe, expect, it } from "vitest";
import { retryFailedSteps, verifyTaskDelivery } from "../src/modules/agent/v3/agent-delivery-verifier.js";

describe("v3 delivery verification", () => {
  it("requires terminal structured evidence and reports partial batches", () => {
    expect(verifyTaskDelivery({ tenantId: "t", taskId: "task", flowId: "f", expected: [{ id: "a", kind: "text" }, { id: "b", kind: "image" }], actual: [{ id: "a", kind: "text", status: "succeeded", text: "ok" }, { id: "b", kind: "image", status: "failed" }] })).toMatchObject({ status: "partial" });
  });
  it("rejects provider success without placement evidence", () => {
    expect(verifyTaskDelivery({ tenantId: "t", taskId: "task", flowId: "f", expected: [{ id: "a", kind: "image" }], actual: [{ id: "a", kind: "image", status: "succeeded", providerJobId: "p" }] }).status).toBe("failed");
  });
  it("retries only failed steps with a new idempotency key", () => { expect(retryFailedSteps([{ id: "ok", status: "succeeded" }, { id: "bad", status: "failed" }])).toEqual([{ id: "bad", status: "pending", retryCount: 1, idempotencyKey: "retry:bad:1" }]); });
});
