import { describe, expect, it } from "vitest";
import { normalizeBlocks } from "./blockNormalizer";

describe("normalizeBlocks", () => {
  it("drops provider and HTML fields from blocks", () => {
    expect(
      normalizeBlocks([{ type: "heading", level: 2, text: "方案", provider: "x", html: "<script/>" }]),
    ).toEqual([{ type: "heading", level: 2, text: "方案" }]);
  });

  it("drops provider, route, credential, signed URLs, and unknown fields from nested data", () => {
    const [block] = normalizeBlocks([{
      type: "result_group",
      title: "结果",
      provider: "secret-provider",
      results: [{
        id: "r1",
        label: "结果一",
        assetId: "asset-1",
        nodeId: "node-1",
        status: "ready",
        route: "internal-route",
        credential: "encrypted-secret",
        signedUrl: "https://temporary.example/file",
        html: "<img>",
      }],
    }]);
    expect(block).toEqual({
      type: "result_group",
      title: "结果",
      results: [{ id: "r1", label: "结果一", assetId: "asset-1", nodeId: "node-1", status: "ready" }],
    });
  });

  it("caps text, list items, and table dimensions", () => {
    const long = "x".repeat(10_000);
    const [paragraph, list, table] = normalizeBlocks([
      { type: "paragraph", text: long },
      { type: "bullet_list", items: Array.from({ length: 100 }, () => long) },
      { type: "comparison_table", columns: Array.from({ length: 30 }, () => long), rows: Array.from({ length: 30 }, () => Array.from({ length: 30 }, () => long)) },
    ]);
    expect(paragraph.type).toBe("paragraph");
    expect(paragraph.text.length).toBeLessThanOrEqual(4_000);
    expect(list.type).toBe("bullet_list");
    expect(list.items.length).toBeLessThanOrEqual(12);
    expect(list.items.every((item) => item.length <= 400)).toBe(true);
    expect(table.type).toBe("comparison_table");
    expect(table.columns.length).toBeLessThanOrEqual(12);
    expect(table.rows.length).toBeLessThanOrEqual(12);
    expect(table.rows.every((row) => row.length <= 12 && row.every((cell) => cell.length <= 400))).toBe(true);
  });
});
