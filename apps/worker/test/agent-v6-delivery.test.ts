import { describe, expect, it } from "vitest";

import { verifyAgentV6Delivery } from "../src/workflow-runtime/agent-v6-delivery.js";

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
});
