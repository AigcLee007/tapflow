import { describe, expect, it } from "vitest";

import { SkillRepository } from "../src/modules/agent/skill.repository.js";
import { SkillService } from "../src/modules/agent/skill.service.js";

describe("SkillService", () => {
  it("does not create a database pool until a skill operation is used", () => {
    expect(() => new SkillService()).not.toThrow();
  });

  it("binds modality and search filters to distinct SQL parameters", async () => {
    const queries: Array<{ sql: string; params: unknown[] | undefined }> = [];
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined,
    };
    const repository = new SkillRepository({ pool: { connect: async () => client } as never });

    await repository.list({ tenantId: "tenant-1", userId: "user-1" }, "available", { modality: "text", q: "copy" });

    const catalogQuery = queries.find((query) => query.sql.includes("FROM agent_skills"));
    expect(catalogQuery?.sql).toContain("s.modality = $3::text");
    expect(catalogQuery?.sql).toContain("s.name ILIKE $4::text OR s.summary ILIKE $4::text");
    expect(catalogQuery?.params).toEqual(["tenant-1", "user-1", "text", "%copy%"]);
  });

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

  it("loads the exact published Skill version selected for a V2 Agent turn", async () => {
    const service = new SkillService({
      repository: {
        getVersionByNumber: async (_context, skillId, version) => ({
          id: "version-2",
          skillId,
          version,
          source: {
            name: "Copy v2",
            summary: "Write revised copy",
            usageScenarios: "Ads",
            inputs: "Facts",
            method: "Analyze facts\nWrite revised copy",
            outputs: "Copy",
            askWhen: "Missing facts",
            modality: "text",
          },
          markdown: "",
          graph: null,
          normalized: { checksum: "checksum", deliveryChecks: [], inputHints: [], modality: "text", steps: [] },
          status: "published",
        }),
      } as never,
    });

    await expect(service.getPublishedVersionByNumber({ tenantId: "tenant-1", userId: "user-1" }, "skill-1", 2))
      .resolves.toMatchObject({ id: "version-2", version: 2 });
  });

  it("forwards expectedRevision to publish so stale editors fail closed", async () => {
    let receivedRevision: number | undefined;
    const service = new SkillService({
      repository: {
        publish: async (_context, skillId, source, normalized, expectedRevision) => {
          receivedRevision = expectedRevision;
          return { id: skillId, name: source.name, modality: normalized.modality, status: "published", version: 2 };
        },
      } as never,
    });
    await service.publish({ tenantId: "tenant-1", userId: "user-1" }, "skill-1", {
      name: "Copy", summary: "Write copy", usageScenarios: "Ads", inputs: "Facts",
      method: "Analyze facts\nWrite copy", outputs: "Copy", askWhen: "Missing facts", modality: "text",
    }, 7);
    expect(receivedRevision).toBe(7);
  });
});
