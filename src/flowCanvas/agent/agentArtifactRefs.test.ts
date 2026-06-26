import { describe, expect, it } from "vitest";

import { buildAgentArtifactRefChips, normalizeAgentArtifactRefSelection } from "./agentArtifactRefs";

describe("agentArtifactRefs", () => {
  it("builds stable reference chips from artifact refs without prompt leakage", () => {
    const chips = buildAgentArtifactRefChips([
      {
        assetId: "asset-1",
        label: "Round 1 image 1",
        refId: "round-1-image-1",
      },
    ]);

    expect(chips).toEqual([
      {
        label: "Round 1 image 1",
        refId: "round-1-image-1",
      },
    ]);
  });

  it("normalizes selected refs by stable ref id only", () => {
    expect(normalizeAgentArtifactRefSelection(["round-1-image-1"], "round-1-image-2")).toEqual([
      "round-1-image-1",
      "round-1-image-2",
    ]);
  });
});
