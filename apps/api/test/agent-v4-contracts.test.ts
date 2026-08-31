import { describe, expect, it } from "vitest";
import {
  nextV4Status,
  safeToolResult,
  V4_TERMINAL_STATUSES,
} from "../src/modules/agent/v4/agent-v4-types.js";
import { agentV4TurnInputSchema, v4ToolInputSchemas, v4ToolJsonSchemas, v4ToolDefinitions, parseV4ToolCall } from "../src/modules/agent/v4/agent-v4-schemas.js";

describe("Agent V4 contracts", () => {
  it("enforces strict state transitions and terminal states", () => {
    expect(nextV4Status("planning", "preview_ready")).toBe("preview_ready");
    expect(() => nextV4Status("preview_ready", "generating_base")).toThrow("AGENT_V4_INVALID_TRANSITION");
    expect(() => nextV4Status("planning", "succeeded")).toThrow("AGENT_V4_INVALID_TRANSITION");
    expect(() => nextV4Status("succeeded", "planning")).toThrow("AGENT_V4_INVALID_TRANSITION");
    expect(V4_TERMINAL_STATUSES).toContain("cancelled");
    for (const malformed of ["constructor", "__proto__", "toString"]) {
      expect(() => nextV4Status(malformed as any, "planning")).toThrow("AGENT_V4_INVALID_TRANSITION");
    }
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
    expect(() => parseV4ToolCall(null as any)).toThrow("AGENT_V4_UNKNOWN_TOOL");
  });

  it("requires expectedRevision for canvas commits and rejects unknown properties", () => {
    expect(v4ToolInputSchemas["canvas.commit_operations"].safeParse({ operations: [] }).success).toBe(false);
    expect(v4ToolInputSchemas["canvas.commit_operations"].safeParse({ expectedRevision: 2, operations: [], extra: true }).success).toBe(false);
    expect(v4ToolInputSchemas["product.analyze"].safeParse({ referenceAssetIds: [], prompt: "  " }).success).toBe(false);
    expect(v4ToolInputSchemas["generation.continue"].safeParse({ prompt: "continue" }).success).toBe(false);
    expect(v4ToolInputSchemas["canvas.commit_operations"].safeParse({ expectedRevision: 1, operations: [{ type: "node.update_data", nodeId: "n1", data: { imageUrl: "https://x" } }] }).success).toBe(false);
    expect(v4ToolInputSchemas["canvas.commit_operations"].safeParse({ expectedRevision: 1, operations: [{ type: "node.update_data", nodeId: "n1", data: { note: " visit https://x" } }] }).success).toBe(false);
    expect(v4ToolInputSchemas["canvas.commit_operations"].safeParse({ expectedRevision: 1, operations: [{ type: "node.update_data", nodeId: "n1", data: { note: "token=secret" } }] }).success).toBe(false);
    expect(v4ToolInputSchemas["canvas.commit_operations"].safeParse({ expectedRevision: 1, operations: [{ type: "node.update_data", nodeId: "n1", data: { file: new Blob(["x"]) } }] }).success).toBe(false);
    for (const key of ["url", "uri", "href", "imageUrl"]) {
      expect(v4ToolInputSchemas["canvas.commit_operations"].safeParse({ expectedRevision: 1, operations: [{ type: "node.update_data", nodeId: "n1", data: { [key]: "example.com/image.png" } }] }).success).toBe(false);
    }
    for (const value of [" custom:payload", "note: https://example.com", "www.example.com/path", "localhost:3000/image.png", "Bearer sk-secret-token"]) {
      expect(v4ToolInputSchemas["canvas.commit_operations"].safeParse({ expectedRevision: 1, operations: [{ type: "node.update_data", nodeId: "n1", data: { note: value } }] }).success).toBe(false);
    }
  });

  it("rejects unsafe snapshot values and bounds recursive input", () => {
    const valid = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
    expect(agentV4TurnInputSchema.safeParse({ prompt: "inspect", snapshot: valid }).success).toBe(true);
    for (const snapshot of [
      { authorization: "Bearer secret" },
      { metadata: { provider: "internal" } },
      { nodes: [{ data: { previewUrl: "data:image/png;base64,abc" } }] },
      { nodes: [{ data: { blob: new Blob(["x"]) } }] },
    ]) {
      expect(agentV4TurnInputSchema.safeParse({ prompt: "inspect", snapshot }).success).toBe(false);
    }
    let nested: Record<string, unknown> = { value: "ok" };
    for (let index = 0; index < 40; index += 1) nested = { child: nested };
    expect(agentV4TurnInputSchema.safeParse({ prompt: "inspect", snapshot: nested }).success).toBe(false);
  });

  it("redacts unsafe provider and transport fields from tool results", () => {
    expect(safeToolResult({ assetId: "a", signedUrl: "https://secret", provider: "internal", nested: { base64: "abc" }, summary: { provider: "x", url: "secret" }, status: "succeeded" })).toEqual({ ok: false, assetId: "a", status: "succeeded" });
    expect(safeToolResult({ assetId: "https://secret", summary: "https://secret", ok: true, revision: Number.NaN, items: [{ itemId: "i", status: "succeeded", assetId: "a", url: "x" }] })).toEqual({ ok: true, items: [{ itemId: "i", status: "succeeded", assetId: "a" }] });
    expect(safeToolResult({ assetId: "https://x", summary: "visit https://x", items: [{ itemId: "i", status: "succeeded", assetId: "http://x" }] })).toEqual({ ok: false, items: [{ itemId: "i", status: "succeeded" }] });
    expect(safeToolResult({ summary: "javascript:alert(1)", items: [{ itemId: "i", status: "unexpected", assetId: "a" }] })).toEqual({ ok: false, items: [{ itemId: "i", assetId: "a" }] });
    expect(safeToolResult({ summary: "visit example.com", itemIds: ["Bearer sk-secret-token"] })).toEqual({ ok: false });
  });

  it("exports strict Responses tool definitions", () => {
    expect(v4ToolDefinitions).toHaveLength(11);
    expect(v4ToolJsonSchemas["image.generate_batch"]).toMatchObject({ additionalProperties: false });
    expect((v4ToolJsonSchemas["image.generate_batch"] as any).properties.items.items.additionalProperties).toBe(false);
  });
});
