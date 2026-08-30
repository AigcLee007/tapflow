import { describe, expect, it } from "vitest";
import { dedupeDeliveryVerificationEvents, retryFailedSteps, verifyTaskDelivery } from "../src/modules/agent/v3/agent-delivery-verifier.js";
import { buildAgentRuntimeObservability, sanitizeAgentRuntimeObservability } from "../src/modules/agent/v3/agent-runtime-observability.js";

describe("v3 delivery verification", () => {
  it("requires terminal structured evidence and reports partial batches", () => {
    expect(verifyTaskDelivery({ tenantId: "t", taskId: "task", flowId: "f", expected: [{ id: "a", kind: "text" }, { id: "b", kind: "image" }], actual: [{ id: "a", kind: "text", status: "succeeded", text: "ok" }, { id: "b", kind: "image", status: "failed" }] })).toMatchObject({ status: "partial" });
  });
  it("rejects provider success without placement evidence", () => {
    expect(verifyTaskDelivery({ tenantId: "t", taskId: "task", flowId: "f", expected: [{ id: "a", kind: "image" }], actual: [{ id: "a", kind: "image", status: "succeeded", providerJobId: "p" }] }).status).toBe("failed");
  });
  it("retries only failed steps with a new idempotency key", () => { expect(retryFailedSteps([{ id: "ok", status: "succeeded" }, { id: "bad", status: "failed" }])).toEqual([{ id: "bad", status: "pending", retryCount: 1, idempotencyKey: "retry:bad:1" }]); });

  it("rejects delivery whose tenant or flow lineage does not match the task", () => {
    expect(verifyTaskDelivery({ tenantId: "tenant-1", taskId: "task", flowId: "flow-1", expected: [{ id: "a", kind: "image" }], actual: [{ id: "a", kind: "image", status: "succeeded", assetId: "asset-1", nodeId: "node-1", tenantId: "tenant-2", flowId: "flow-1" }] }).status).toBe("failed");
  });

  it("deduplicates verification events by idempotency key without changing event order", () => {
    expect(dedupeDeliveryVerificationEvents([
      { idempotencyKey: "verify:1", status: "verified" },
      { idempotencyKey: "verify:1", status: "failed" },
      { idempotencyKey: "verify:2", status: "partial" },
    ])).toEqual([
      { idempotencyKey: "verify:1", status: "verified" },
      { idempotencyKey: "verify:2", status: "partial" },
    ]);
  });

  it("builds bounded observability and redacts provider-facing fields", () => {
    expect(sanitizeAgentRuntimeObservability(buildAgentRuntimeObservability({
      firstEventAt: 1_000,
      now: 3_500,
      contextSize: 200_000,
      toolRounds: 99,
      repairCount: 4,
      deliveryDurationMs: -3,
      terminalStatus: "succeeded",
      billingTotal: -2,
      provider: "secret-provider",
      credentialId: "secret-credential",
    }))).toEqual({ firstEventLatencyMs: 2_500, contextSize: 100_000, toolRounds: 8, repairCount: 1, deliveryDurationMs: 0, terminalStatus: "succeeded", billingTotal: 0 });
  });
});
