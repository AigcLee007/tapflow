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

  it("exports a creator-readable SKILL.md and imports it without executable package fields", async () => {
    const service = new SkillService({
      repository: {
        getVersion: async () => ({
          id: "version-1",
          skillId: "skill-1",
          version: 1,
          source: {
            name: "Copy",
            summary: "Write copy",
            usageScenarios: "Ads",
            inputs: "Facts",
            method: "Analyze facts\nWrite copy",
            outputs: "Copy",
            askWhen: "Missing facts",
            modality: "text",
          },
          markdown: "",
          graph: null,
          status: "published",
        }),
        createDraft: async (_context, source, packageData) => ({ id: "skill-2", ownerUserId: "user-1", source, revision: 0, graph: packageData?.graphJson ?? null }),
      } as never,
    });
    const exported = await service.exportPackage({ tenantId: "tenant-1", userId: "user-1" }, "skill-1");
    expect(exported.skillMd).toContain("compatible_graph_schema: v2");
    const imported = await service.importPackage({ tenantId: "tenant-1", userId: "user-1" }, { skillMd: exported.skillMd, graphJson: { schemaVersion: "v2", nodes: [{ id: "text-1", type: "text", data: { body: "{{topic}}" } }], edges: [] } });
    expect(imported.id).toBe("skill-2");
    expect(imported.graph).toMatchObject({ schemaVersion: "v2" });
    await expect(service.importPackage({ tenantId: "tenant-1", userId: "user-1" }, { skillMd: exported.skillMd, graphJson: { script: "node" } })).rejects.toThrow();
  });
});
