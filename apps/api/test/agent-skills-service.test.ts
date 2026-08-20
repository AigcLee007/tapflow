import { describe, expect, it } from "vitest";

import { SkillService } from "../src/modules/agent/skill.service.js";

describe("SkillService", () => {
  it("publishes a normalized private Skill and returns only safe fields", async () => {
    const service = new SkillService({
      repository: {
        createDraft: async (_context, source) => ({ id: "skill-1", ownerUserId: "user-1", source, revision: 0 }),
        publish: async (_context, _skillId, source, normalized) => ({
          id: "skill-1",
          name: source.name,
          modality: normalized.modality,
          status: "published",
          version: 1,
        }),
      } as never,
    });

    const result = await service.createAndPublish({ tenantId: "tenant-1", userId: "user-1" }, {
      name: "Copy",
      summary: "Write copy",
      usageScenarios: "Ads",
      inputs: "Facts",
      method: "Analyze facts\nWrite copy",
      outputs: "Copy",
      askWhen: "Missing facts",
      modality: "text",
    });

    expect(result).toMatchObject({ id: "skill-1", status: "published", modality: "text", version: 1 });
    expect(result).not.toHaveProperty("normalized");
  });
});
