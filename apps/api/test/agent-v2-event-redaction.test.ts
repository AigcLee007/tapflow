import { describe, expect, it } from "vitest";

import { sanitizeV2AgentEventForClient } from "../src/modules/agent/agent-redaction.js";

describe("sanitizeV2AgentEventForClient", () => {
  it("keeps only product-safe tool-result fields before persistence and SSE", () => {
    expect(sanitizeV2AgentEventForClient({
      callId: "call-1",
      name: "canvas.await_results",
      result: {
        allTerminal: true,
        apiKey: "secret",
        assetRefs: [{ assetId: "asset-1", kind: "image", label: "Banner", promptSummary: "Sale", refId: "ref-1", signedUrl: "https://example.invalid/signed" }],
        baseUrl: "https://provider.invalid",
        routeKey: "internal.route",
        runs: [{ id: "run-1", provider: "internal", status: "succeeded" }],
      },
      type: "tool_result",
    })).toEqual({
      callId: "call-1",
      name: "canvas.await_results",
      result: {
        allTerminal: true,
        assetRefs: [{ assetId: "asset-1", kind: "image", label: "Banner", promptSummary: "Sale", refId: "ref-1" }],
        runs: [{ id: "run-1", status: "succeeded" }],
      },
      type: "tool_result",
    });
  });
});
