import { describe, expect, it } from "vitest";

import { normalizeAgentV5Blocks } from "./agentV5Blocks";

describe("agent V5 block normalization", () => {
  it("normalizes structured blocks and rejects unsafe provider fields", () => {
    const blocks = normalizeAgentV5Blocks([{
      type: "heading",
      level: 2,
      text: "方案比较",
      provider: "secret-provider",
      html: "<script>bad</script>",
    }]);

    expect(blocks).toEqual([{ type: "heading", level: 2, text: "方案比较" }]);
  });

  it("projects legacy strings to bounded paragraph blocks", () => {
    const blocks = normalizeAgentV5Blocks(["第一段", "第二段"]);
    expect(blocks).toEqual([
      { type: "paragraph", text: "第一段" },
      { type: "paragraph", text: "第二段" },
    ]);
  });

  it("whitelists stable result references and caps text and arrays", () => {
    const longText = "x".repeat(5000);
    const blocks = normalizeAgentV5Blocks([{
      type: "result_group",
      results: Array.from({ length: 20 }, (_, index) => ({
        id: `result-${index}`,
        label: longText,
        assetId: `asset-${index}`,
        previewUrl: "https://signed.example/secret?signature=abc",
        signedUrl: "https://signed.example/secret?signature=def",
      })),
      config: { apiKey: "secret" },
    }]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "result_group" });
    if (blocks[0]?.type === "result_group") {
      expect(blocks[0].results).toHaveLength(12);
      expect(blocks[0].results[0]).toEqual({
        id: "result-0",
        label: longText.slice(0, 400),
        assetId: "asset-0",
      });
    }
    expect(JSON.stringify(blocks)).not.toContain("signed.example");
    expect(JSON.stringify(blocks)).not.toContain("apiKey");
  });

  it("drops unknown block types and raw HTML fields", () => {
    expect(normalizeAgentV5Blocks([
      { type: "html", html: "<img src=x onerror=alert(1)>" },
      { type: "divider", html: "<script>bad</script>", provider: "private" },
    ])).toEqual([{ type: "divider" }]);
  });
});
