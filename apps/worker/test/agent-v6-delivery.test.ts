import { describe, expect, it, vi } from "vitest";

import { verifyAgentV6Delivery } from "../src/workflow-runtime/agent-v6-delivery.js";
import { verifyAgentV6DeliveryBeforeSuccess, WorkflowNodeExecutionService } from "../src/workflow-runtime/service.js";

describe("Agent V6 delivery verification", () => {
  it("accepts non-empty text output", () => {
    expect(verifyAgentV6Delivery({ text: "  已完成的文案  " })).toEqual({
      kind: "text",
      status: "delivered",
      text: "已完成的文案",
    });
  });

  it("accepts at least one stable asset ID", () => {
    expect(verifyAgentV6Delivery({
      assets: [{ assetId: "00000000-0000-4000-8000-000000000001" }],
    })).toEqual({
      assetIds: ["00000000-0000-4000-8000-000000000001"],
      kind: "asset",
      status: "delivered",
    });
  });

  it.each([
    ["empty output", {}],
    ["empty text", { text: "  " }],
    ["temporary URL", { url: "https://temporary.example/output.png" }],
    ["data URL", { output: "data:image/png;base64,abc" }],
    ["blob URL", { output: "blob:https://local/output" }],
    ["base64 output", { output: "iVBORw0KGgoAAAANSUhEUgAAAAUA" }],
    ["provider-only output", { provider: "internal-provider", taskId: "task-1" }],
  ])("rejects %s as non-delivery", (_label, output) => {
    expect(verifyAgentV6Delivery(output)).toMatchObject({
      code: "DELIVERY_NOT_VERIFIED",
      retryable: true,
      status: "failed",
    });
  });

  it("rejects unsafe provider fields even when text is present", () => {
    expect(verifyAgentV6Delivery({
      text: "safe-looking text",
      provider: "internal-provider",
    })).toMatchObject({
      code: "DELIVERY_NOT_VERIFIED",
      status: "failed",
    });
  });

  it("rejects non-stable asset references and nested unsafe fields", () => {
    expect(verifyAgentV6Delivery({
      assets: [{ assetId: "https://temporary.example/file" }],
      metadata: { signedUrl: "https://temporary.example/file" },
    })).toMatchObject({
      code: "DELIVERY_NOT_VERIFIED",
      status: "failed",
    });
  });

  it("makes cancellation terminal and non-retryable", () => {
    expect(verifyAgentV6Delivery({ text: "late result" }, { canceled: true })).toEqual({
      code: "DELIVERY_CANCELED",
      retryable: false,
      status: "canceled",
    });
  });

  it("marks failed delivery as retryable for the existing recovery path", () => {
    expect(verifyAgentV6Delivery(null)).toEqual({
      code: "DELIVERY_NOT_VERIFIED",
      retryable: true,
      status: "failed",
    });
  });

  it("calls the injected verifier for an Agent V6 workflow before success/settle", () => {
    const verifier = vi.fn(() => ({
      code: "DELIVERY_NOT_VERIFIED" as const,
      retryable: true as const,
      status: "failed" as const,
    }));

    const result = verifyAgentV6DeliveryBeforeSuccess(
      { input_json: { agentV6: true } },
      {},
      verifier,
    );

    expect(verifier).toHaveBeenCalledWith({});
    expect(result).toEqual({
      code: "DELIVERY_NOT_VERIFIED",
      retryable: true,
      status: "failed",
    });
  });

  it("does not gate ordinary workflows with the Agent V6 verifier", () => {
    const verifier = vi.fn(() => verifyAgentV6Delivery(null));

    expect(verifyAgentV6DeliveryBeforeSuccess({ input_json: {} }, {}, verifier)).toEqual({
      status: "not_applicable",
    });
    expect(verifier).not.toHaveBeenCalled();
  });

  it("stops the real success path before settle or succeeded writes", async () => {
    const verifier = vi.fn(() => ({
      code: "DELIVERY_NOT_VERIFIED" as const,
      retryable: true as const,
      status: "failed" as const,
    }));
    const service = new WorkflowNodeExecutionService({
      agentV6DeliveryVerifier: verifier,
      assetBucket: "test-bucket",
      mediaGenerationRuntime: {} as never,
      nodeExecuteQueue: {} as never,
      personalWalletService: {} as never,
      pool: {} as never,
      providerPollQueue: {} as never,
      storageProvider: {} as never,
      textGenerationRuntime: {} as never,
    });
    const client = { query: vi.fn() };

    await expect((service as unknown as {
      markNodeSucceededAndUnlockDependents: (...args: unknown[]) => Promise<unknown>;
    }).markNodeSucceededAndUnlockDependents(
      client,
      {},
      {},
      { input_json: { agentV6: true } },
      {},
      {},
      {},
    )).rejects.toMatchObject({ code: "DELIVERY_NOT_VERIFIED" });

    expect(verifier).toHaveBeenCalledTimes(1);
    expect(client.query).not.toHaveBeenCalled();
  });
});
