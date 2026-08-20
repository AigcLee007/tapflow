import { describe, expect, it } from "vitest";

import { OFFICIAL_AGENT_SKILLS } from "../src/modules/agent/official-skills.js";

describe("official Agent Skills", () => {
  it("contains first-class text, image, and video creation guides", () => {
    expect(new Set(OFFICIAL_AGENT_SKILLS.map((skill) => skill.modality))).toEqual(new Set(["text", "image", "video"]));
    expect(OFFICIAL_AGENT_SKILLS.length).toBeGreaterThanOrEqual(7);
    for (const skill of OFFICIAL_AGENT_SKILLS) {
      expect(skill.slug).toMatch(/^[a-z0-9-]+$/);
      expect(JSON.stringify(skill)).not.toMatch(/api[_-]?key|authorization|routekey|baseurl|provider/i);
    }
  });
});
