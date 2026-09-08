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

  it("keeps safe asset node references and rejects non-finite costs", () => {
    const [block] = normalizeBlocks([{
      type: "confirmation_card",
      text: "确认",
      plan: { costCredits: Number.POSITIVE_INFINITY, writesCanvas: true, provider: "x" },
    }]);
    expect(block).toEqual({ type: "confirmation_card", text: "确认", plan: { writesCanvas: true } });
  });

  it("drops transient and token-like identifiers from result blocks", () => {
    const [block] = normalizeBlocks([{
      type: "result_group",
      results: [
        { id: "r1", label: "bad asset", assetId: "data:image/png;base64,abc", nodeId: "node-1", refId: "ref-1", uploadedAssetIds: ["asset-1"] },
        { id: "r2", label: "bad ref", assetId: "asset-2", nodeId: "https://signed.example/node", refId: "blob:https://local/ref", uploadedAssetIds: ["https://signed.example/asset?token=x"] },
        { id: "r3", label: "safe", assetId: "asset-3", nodeId: "node-3", refId: "ref-3", uploadedAssetIds: ["asset-4"] },
      ],
    }]);
    expect(block).toEqual({
      type: "result_group",
      results: [{ id: "r3", label: "safe", assetId: "asset-3", nodeId: "node-3", refId: "ref-3", uploadedAssetIds: ["asset-4"] }],
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

  it("caps every input array before mapping, including uploaded asset IDs", () => {
    const values = Array.from({ length: 100_000 }, (_, index) => `asset-${index}`);
    const [block] = normalizeBlocks([{
      type: "result_group",
      results: [{ id: "result-1", label: "结果", uploadedAssetIds: values }],
    }]);

    expect(block).toEqual({
      type: "result_group",
      results: [{ id: "result-1", label: "结果", uploadedAssetIds: values.slice(0, 12) }],
    });
  });

  it("normalizes understanding and question blocks with stable IDs and boolean locked state", () => {
    expect(normalizeBlocks([
      {
        type: "understanding",
        id: "understanding-1",
        title: "理解",
        text: "先梳理需求",
        locked: true,
        provider: "hidden",
      },
      {
        type: "question",
        id: "question-1",
        title: "目标",
        prompt: "请选择",
        options: ["儿童", 42, "成人"],
        locked: false,
        html: "<script>",
      },
    ])).toEqual([
      { type: "understanding", id: "understanding-1", title: "理解", text: "先梳理需求", locked: true },
      { type: "question", id: "question-1", title: "目标", prompt: "请选择", options: ["儿童", "成人"], locked: false },
    ]);
  });

  it("drops invalid runtime values instead of throwing while normalizing interactive blocks", () => {
    expect(() => normalizeBlocks([
      42,
      { type: "understanding", id: { bad: true }, text: 42, locked: "yes" },
      { type: "question", id: "https://signed.example/question", prompt: 42, options: "bad" },
    ] as unknown[])).not.toThrow();
    expect(normalizeBlocks([
      { type: "understanding", id: { bad: true }, text: 42, locked: "yes" },
      { type: "question", id: "https://signed.example/question", prompt: 42, options: "bad" },
    ] as unknown[])).toEqual([{ type: "understanding", text: "" }]);
  });
});
