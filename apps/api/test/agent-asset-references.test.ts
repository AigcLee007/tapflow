import { describe, expect, it } from "vitest";

import {
  buildAgentAssetReference,
  buildAgentToolResultReferences,
} from "../src/modules/agent/agent-asset-references.js";

describe("agent asset references", () => {
  it("creates stable safe image refs without provider internals", () => {
    const ref = buildAgentAssetReference({
      assetId: "asset-1",
      height: 2048,
      index: 0,
      kind: "image",
      prompt: "A warm ecommerce hero image with product centered and soft sunlight",
      roundIndex: 2,
      width: 2048,
    });

    expect(ref).toEqual({
      assetId: "asset-1",
      height: 2048,
      kind: "image",
      label: "Round 2 image 1",
      promptSummary: "A warm ecommerce hero image with product centered and soft sunlight",
      refId: "round-2-image-1",
      width: 2048,
    });
    expect(JSON.stringify(ref)).not.toMatch(/baseUrl|provider|route_key|upstream_model|Authorization/i);
  });

  it("truncates long prompt summaries", () => {
    const ref = buildAgentAssetReference({
      assetId: "asset-2",
      index: 1,
      kind: "image",
      prompt: "x".repeat(260),
      roundIndex: 1,
    });

    expect(ref.promptSummary).toHaveLength(160);
    expect(ref.promptSummary.endsWith("...")).toBe(true);
  });

  it("builds a safe tool result reference payload", () => {
    const result = buildAgentToolResultReferences({
      assets: [
        { assetId: "asset-1", kind: "image", prompt: "first", width: 1024, height: 1024 },
        { assetId: "asset-2", kind: "image", prompt: "second" },
      ],
      roundIndex: 3,
      status: "succeeded",
      toolCallId: "tool-call-1",
    });

    expect(result).toEqual({
      assetRefs: [
        expect.objectContaining({ assetId: "asset-1", label: "Round 3 image 1", refId: "round-3-image-1" }),
        expect.objectContaining({ assetId: "asset-2", label: "Round 3 image 2", refId: "round-3-image-2" }),
      ],
      status: "succeeded",
      toolCallId: "tool-call-1",
    });
  });
});
