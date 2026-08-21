import { describe, expect, it } from "vitest";

import { extractAgentSkillAssetId } from "../src/workflow-runtime/service.js";

describe("Agent Skill output mapping", () => {
  it("extracts the persisted primary asset id from media output", () => {
    expect(extractAgentSkillAssetId({
      assets: [{ assetId: "00000000-0000-4000-8000-000000000123", mimeType: "image/png" }],
    })).toBe("00000000-0000-4000-8000-000000000123");
  });

  it("does not treat a URL-only output as a persisted asset", () => {
    expect(extractAgentSkillAssetId({ assets: [{ url: "https://provider.invalid/result.png" }] })).toBeNull();
  });
});
