import { describe, expect, it } from "vitest";

import { OFFICIAL_AGENT_SKILLS } from "../src/modules/agent/official-skills.js";
import { seedOfficialSkills } from "../src/modules/agent/official-skill-seed.js";

describe("official Agent Skills", () => {
  it("contains the provider-agnostic text, image, and video catalog", () => {
    expect(OFFICIAL_AGENT_SKILLS).toHaveLength(8);
    expect(OFFICIAL_AGENT_SKILLS.find((skill) => skill.slug === "taobao-product-image-suite")?.normalized.methodSteps.map((step) => step.instruction).join(" ")).toContain("视觉圣经");
    expect(new Set(OFFICIAL_AGENT_SKILLS.map((skill) => skill.modality))).toEqual(new Set(["text", "image", "video"]));
    for (const skill of OFFICIAL_AGENT_SKILLS) {
      expect(skill.slug).toMatch(/^[a-z0-9-]+$/);
      expect(skill.normalized.checksum).toMatch(/^[a-f0-9]{64}$/);
      const serialized = JSON.stringify(skill);
      expect(serialized).not.toMatch(/api[_-]?key|authorization|baseurl|credential|route[_-]?key|provider/i);
      expect(serialized).not.toMatch(/https?:\/\/|data:|blob:/i);
    }
  });

  it("writes official records in platform scope and is idempotent by checksum", async () => {
    let mode: "create" | "same" = "create";
    let sequence = 0;
    const sql: string[] = [];
    const client = {
      query: async (statement: string, params?: unknown[]) => {
        sql.push(statement);
        if (statement.includes("SELECT s.id::text AS id")) {
          if (mode === "create") return { rows: [], rowCount: 0 };
          const slug = String(params?.[0] ?? "");
          const skill = OFFICIAL_AGENT_SKILLS.find((item) => item.slug === slug)!;
          return { rows: [{ id: `official-${slug}`, version_id: `version-${slug}`, source_checksum: skill.normalized.checksum, version_no: 1 }], rowCount: 1 };
        }
        if (statement.includes("INSERT INTO agent_skills")) return { rows: [{ id: `official-${++sequence}` }], rowCount: 1 };
        if (statement.includes("INSERT INTO agent_skill_versions")) return { rows: [{ id: `version-${++sequence}` }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      },
      release: () => undefined,
    };
    const pool = { connect: async () => client } as never;

    const created = await seedOfficialSkills(pool);
    expect(created.created).toBe(8);
    expect(sql).toContain("SELECT set_config('app.is_system_admin', 'true', true)");
    expect(sql.some((statement) => statement.includes("tenant_id, owner_user_id, visibility"))).toBe(true);
    expect(sql.some((statement) => statement.includes("source_markdown") && statement.includes("frontmatter_json"))).toBe(true);
    mode = "same";
    const unchanged = await seedOfficialSkills(pool);
    expect(unchanged).toEqual({ created: 0, updated: 0, unchanged: 8 });
  });
});
