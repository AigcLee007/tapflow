import { describe, expect, it } from "vitest";
import {
  nextV4Status,
  safeToolResult,
  V4_TERMINAL_STATUSES,
} from "../src/modules/agent/v4/agent-v4-types.js";
import { v4ToolInputSchemas, v4ToolJsonSchemas, v4ToolDefinitions, parseV4ToolCall } from "../src/modules/agent/v4/agent-v4-schemas.js";

describe("Agent V4 contracts", () => {
  it("enforces strict state transitions and terminal states", () => {
    expect(nextV4Status("planning", "preview_ready")).toBe("preview_ready");
    expect(() => nextV4Status("planning", "succeeded")).toThrow("AGENT_V4_INVALID_TRANSITION");
    expect(() => nextV4Status("succeeded", "planning")).toThrow("AGENT_V4_INVALID_TRANSITION");
    expect(V4_TERMINAL_STATUSES).toContain("cancelled");
  });

  it("parses valid calls and rejects invalid batch calls", () => {
    const parsed = parseV4ToolCall({
      name: "image.generate_batch",
      arguments: JSON.stringify({
        items: [
          { itemId: "i1", pageKey: "p1", prompt: "A complete prompt", referenceAssetIds: [] },
          { itemId: "i2", pageKey: "p2", prompt: "Another complete prompt", referenceAssetIds: [] },
        ],
      }),
    });
    expect(parsed.name).toBe("image.generate_batch");
    expect(() => parseV4ToolCall({ name: "image.generate_batch", arguments: JSON.stringify({ items: [] }) })).toThrow();
    expect(() => parseV4ToolCall({ name: "not.allowed", arguments: "{}" })).toThrow();
  });

  it("requires expectedRevision for canvas commits and rejects unknown properties", () => {
    expect(v4ToolInputSchemas["canvas.commit_operations"].safeParse({ operations: [] }).success).toBe(false);
    expect(v4ToolInputSchemas["canvas.commit_operations"].safeParse({ expectedRevision: 2, operations: [], extra: true }).success).toBe(false);
  });

  it("redacts unsafe provider and transport fields from tool results", () => {
    expect(safeToolResult({ assetId: "a", signedUrl: "https://secret", provider: "internal", nested: { base64: "abc" }, summary: { provider: "x", url: "secret" }, status: "succeeded" })).toEqual({ assetId: "a", status: "succeeded" });
  });

  it("exports strict Responses tool definitions", () => {
    expect(v4ToolDefinitions).toHaveLength(11);
    expect(v4ToolJsonSchemas["image.generate_batch"]).toMatchObject({ additionalProperties: false });
    expect((v4ToolJsonSchemas["image.generate_batch"] as any).properties.items.items.additionalProperties).toBe(false);
  });
});
