import type { Pool, PoolClient } from "pg";

import { parseSkillMarkdown, serializeSkillMarkdown } from "@aigc-flow/workflow-core";

import { OFFICIAL_AGENT_SKILLS } from "./official-skills.js";

export type OfficialSkillSeedResult = {
  created: number;
  updated: number;
  unchanged: number;
};

/**
 * Seed only platform-scoped official Skills. Private tenant Skills are never
 * selected or updated by this function.
 */
export async function seedOfficialSkills(pool: Pool): Promise<OfficialSkillSeedResult> {
  const client = await pool.connect();
  const result: OfficialSkillSeedResult = { created: 0, updated: 0, unchanged: 0 };
  try {
    await client.query("BEGIN");
    // Official records are platform-scoped and must pass the same FORCE RLS
    // policy used by production. This transaction is only reached by the
    // guarded local/staging seed command.
    await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
    for (const skill of OFFICIAL_AGENT_SKILLS) {
      const source = {
        name: skill.name,
        summary: skill.summary,
        usageScenarios: skill.usageScenarios,
        inputs: skill.inputs,
        method: skill.method,
        outputs: skill.outputs,
        askWhen: skill.askWhen,
        ...(skill.category ? { category: skill.category } : {}),
        modality: skill.modality,
        ...(skill.triggers ? { triggers: skill.triggers } : {}),
      };
      const skillMd = serializeSkillMarkdown({
        approval_policy: skill.normalized.approvalRules.beforeCreditRun ? "credit_required" : "auto",
        ...(skill.category ? { category: skill.category } : {}),
        compatible_graph_schema: "v2",
        description: skill.summary,
        inputs: skill.normalized.inputHints.map((item) => item.label),
        modality: skill.modality,
        name: skill.name,
        outputs: skill.normalized.deliveryChecks,
        triggers: skill.triggers ?? [],
      }, skill.method);
      const frontmatter = parseSkillMarkdown(skillMd).frontmatter;

      const existing = await client.query<{
        id: string;
        version_id: string | null;
        source_checksum: string | null;
        version_no: number | null;
      }>(
        `SELECT s.id::text AS id, v.id::text AS version_id, v.source_checksum,
                v.version_no
           FROM agent_skills s
           LEFT JOIN agent_skill_versions v ON v.id = s.current_version_id
          WHERE s.visibility = 'official' AND s.tenant_id IS NULL AND s.slug = $1
          LIMIT 1`,
        [skill.slug],
      );
      const row = existing.rows[0];
      if (!row) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO agent_skills
             (tenant_id, owner_user_id, visibility, status, slug, name, summary, modality, revision)
           VALUES (NULL, NULL, 'official', 'published', $1, $2, $3, $4, 0)
           RETURNING id::text AS id`,
          [skill.slug, skill.name, skill.summary, skill.modality],
        );
        const skillId = inserted.rows[0]?.id;
        if (!skillId) throw new Error(`Failed to insert official Skill ${skill.slug}`);
        const version = await insertVersion(client, skillId, 1, source, skill.normalized, skill.slug, skillMd, frontmatter);
        await client.query(
          `UPDATE agent_skills SET current_version_id = $2::uuid, updated_at = now()
            WHERE id = $1::uuid`,
          [skillId, version],
        );
        result.created += 1;
        continue;
      }

      if (row.source_checksum === skill.normalized.checksum) {
        result.unchanged += 1;
        continue;
      }

      const nextVersion = Number(row.version_no ?? 0) + 1;
      const version = await insertVersion(client, row.id, nextVersion, source, skill.normalized, skill.slug, skillMd, frontmatter);
      await client.query(
        `UPDATE agent_skills
            SET status = 'published', name = $2, summary = $3, modality = $4,
                current_version_id = $5::uuid, updated_at = now()
          WHERE id = $1::uuid AND visibility = 'official' AND tenant_id IS NULL`,
        [row.id, skill.name, skill.summary, skill.modality, version],
      );
      result.updated += 1;
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function insertVersion(
  client: PoolClient,
  skillId: string,
  versionNo: number,
  source: Record<string, unknown>,
  normalized: (typeof OFFICIAL_AGENT_SKILLS)[number]["normalized"],
  slug: string,
  skillMd: string,
  frontmatter: unknown,
): Promise<string> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO agent_skill_versions
       (tenant_id, skill_id, version_no, source_json, source_markdown,
        frontmatter_json, normalized_json, source_checksum, status, created_by)
     VALUES (NULL, $1::uuid, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb, $7, 'published', NULL)
     RETURNING id::text AS id`,
    [
      skillId,
      versionNo,
      JSON.stringify(source),
      skillMd,
      JSON.stringify(frontmatter),
      JSON.stringify(normalized),
      normalized.checksum,
    ],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error(`Failed to insert official Skill version ${slug}@${versionNo}`);
  return id;
}
