import { describe, expect, it } from "vitest";

import { normalizeConversationBlocks } from "./ConversationBlockTypes";

describe("normalizeConversationBlocks", () => {
  it("converts a legacy reply string into a paragraph block", () => {
    expect(normalizeConversationBlocks("你好，先确认一下方向。")).toEqual([
      { type: "paragraph", text: "你好，先确认一下方向。" },
    ]);
  });

  it("keeps only whitelisted fields for known blocks", () => {
    expect(
      normalizeConversationBlocks([
        {
          type: "paragraph",
          text: "Use the reference image",
          html: "<script>bad</script>",
          providerApiKey: "secret",
        },
      ]),
    ).toEqual([{ type: "paragraph", text: "Use the reference image" }]);
  });

  it("rejects unknown blocks and malformed input", () => {
    expect(
      normalizeConversationBlocks([
        { type: "unknown", text: "ignore" },
        null,
        42,
      ]),
    ).toEqual([]);
    expect(normalizeConversationBlocks({ type: "paragraph", text: "no" })).toEqual([]);
    expect(normalizeConversationBlocks(null)).toEqual([]);
  });

  it("truncates overlong text and limits collection sizes", () => {
    const longText = "x".repeat(5000);
    const blocks = normalizeConversationBlocks([
      { type: "paragraph", text: longText },
      ...Array.from({ length: 20 }, (_, index) => ({ type: "paragraph", text: String(index) })),
    ]);

    expect(blocks).toHaveLength(12);
    expect((blocks[0] as { type: "paragraph"; text: string }).text).toHaveLength(4000);
  });
});
