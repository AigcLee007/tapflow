import type { Pool, PoolClient } from "pg";

import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import { serializeSkillMarkdown, parseSkillMarkdown } from "@aigc-flow/workflow-core";

import { normalizeSkillSource } from "./skill-normalizer.js";
import type { NormalizedSkill, SkillSource } from "./skill-types.js";

export type SkillDbContext = { tenantId: string; userId: string | null };
export type SkillPreview = {
  id: string;
  modality: SkillSource["modality"];
  name: string;
  ownerUserId: string | null;
  status: string;
  summary: string;
  version: number;
  visibility: "official" | "private";
};
export type SkillDraft = { id: string; ownerUserId: string; revision: number; source: SkillSource };
export type SkillVersion = {
  id: string;
  skillId: string;
  version: number;
  source: SkillSource;
  markdown: string;
  graph: unknown | null;
  normalized: NormalizedSkill;
  status: string;
};

type SkillRepositoryOptions = { pool?: Pool };

export class SkillRepository {
  readonly pool: Pool;

  constructor(options: SkillRepositoryOptions = {}) {
    this.pool = options.pool ?? createPgPool();
  }

  async list(context: SkillDbContext, scope: "available" | "mine", filters: { modality?: string; q?: string } = {}): Promise<SkillPreview[]> {
    return withTenantTransaction(context, async (client) => {
      const values: unknown[] = [context.tenantId, context.userId];
      const predicates = scope === "mine"
        ? "s.visibility = 'private' AND s.tenant_id = $1::uuid AND s.owner_user_id = $2::uuid"
        : "((s.visibility = 'official' AND s.tenant_id IS NULL AND s.status = 'published') OR (s.visibility = 'private' AND s.tenant_id = $1::uuid AND s.status = 'published'))";
      const modalityParameter = filters.modality ? values.push(filters.modality) : null;
      const searchParameter = filters.q ? values.push(`%${filters.q}%`) : null;
      const result = await client.query<{
        id: string; modality: SkillSource["modality"]; name: string; owner_user_id: string | null;
        status: string; summary: string; version: number; visibility: "official" | "private";
      }>(`SELECT s.id::text AS id, s.modality, s.name, s.owner_user_id::text AS owner_user_id, s.status, s.summary, COALESCE(v.version_no, 0) AS version, s.visibility FROM agent_skills s LEFT JOIN agent_skill_versions v ON v.id = s.current_version_id WHERE ${predicates}${modalityParameter ? ` AND s.modality = $${modalityParameter}::text` : ""}${searchParameter ? ` AND (s.name ILIKE $${searchParameter}::text OR s.summary ILIKE $${searchParameter}::text)` : ""} ORDER BY s.updated_at DESC`, values);
      return result.rows.map((row) => ({ id: row.id, modality: row.modality, name: row.name, ownerUserId: row.owner_user_id, status: row.status, summary: row.summary, version: Number(row.version), visibility: row.visibility }));
    }, this.pool);
  }

  async createDraft(context: SkillDbContext, source: SkillSource, packageData: { graphJson?: unknown | null } = {}): Promise<SkillDraft & { graph?: unknown | null }> {
    return withTenantTransaction(context, async (client) => {
      const normalized = normalizeSkillSource(source);
      const projection = skillProjection(source, normalized);
      const result = await client.query<{ id: string }>(`INSERT INTO agent_skills (tenant_id, owner_user_id, visibility, status, slug, name, summary, modality) VALUES ($1::uuid, $2::uuid, 'private', 'draft', $3, $4, $5, $6) RETURNING id::text AS id`, [context.tenantId, context.userId, slugify(source.name), source.name, source.summary, source.modality]);
      const id = result.rows[0]!.id;
      await client.query(`INSERT INTO agent_skill_versions (tenant_id, skill_id, version_no, source_json, source_markdown, frontmatter_json, normalized_json, graph_json, source_checksum, status, created_by) VALUES ($1::uuid, $2::uuid, 1, $3::jsonb, $4, $5::jsonb, $6::jsonb, $8::jsonb, $7, 'draft', $9::uuid)`, [context.tenantId, id, JSON.stringify(source), projection.markdown, JSON.stringify(projection.frontmatter), JSON.stringify(normalized), normalized.checksum, packageData.graphJson ? JSON.stringify(packageData.graphJson) : null, context.userId]);
      return { id, ownerUserId: context.userId!, revision: 0, source, graph: packageData.graphJson ?? null };
    }, this.pool);
  }

  async getDraft(context: SkillDbContext, skillId: string): Promise<SkillDraft | null> {
    return withTenantTransaction(context, async (client) => {
      const row = await client.query<{ id: string; owner_user_id: string; revision: number; source_json: SkillSource }>(`SELECT s.id::text AS id, s.owner_user_id::text AS owner_user_id, s.revision, v.source_json FROM agent_skills s JOIN agent_skill_versions v ON v.skill_id = s.id AND v.status = 'draft' WHERE s.id = $1::uuid AND s.tenant_id = $2::uuid AND s.owner_user_id = $3::uuid ORDER BY v.version_no DESC LIMIT 1`, [skillId, context.tenantId, context.userId]);
      const value = row.rows[0];
      return value ? { id: value.id, ownerUserId: value.owner_user_id, revision: Number(value.revision), source: value.source_json } : null;
    }, this.pool);
  }

  async getVersion(context: SkillDbContext, skillId: string): Promise<SkillVersion | null> {
    return withTenantTransaction(context, async (client) => {
      const row = await client.query<{
        id: string; skill_id: string; version_no: number; source_json: SkillSource;
        source_markdown: string; graph_json: unknown | null; normalized_json: NormalizedSkill; status: string;
      }>(`SELECT v.id::text AS id, v.skill_id::text AS skill_id, v.version_no, v.source_json, v.source_markdown, v.graph_json, v.normalized_json, v.status
          FROM agent_skill_versions v JOIN agent_skills s ON s.id = v.skill_id
          WHERE s.id = $1::uuid AND ((s.visibility = 'official' AND s.status = 'published' AND s.tenant_id IS NULL)
            OR (s.visibility = 'private' AND s.tenant_id = $2::uuid AND s.owner_user_id = $3::uuid))
            AND v.status = 'published' ORDER BY v.version_no DESC LIMIT 1`, [skillId, context.tenantId, context.userId]);
      const value = row.rows[0];
      return value ? { id: value.id, skillId: value.skill_id, version: Number(value.version_no), source: value.source_json, markdown: value.source_markdown, graph: value.graph_json, normalized: value.normalized_json, status: value.status } : null;
    }, this.pool);
  }

  async getVersionByNumber(context: SkillDbContext, skillId: string, version: number): Promise<SkillVersion | null> {
    return withTenantTransaction(context, async (client) => {
      const row = await client.query<{
        id: string; skill_id: string; version_no: number; source_json: SkillSource;
        source_markdown: string; graph_json: unknown | null; normalized_json: NormalizedSkill; status: string;
      }>(`SELECT v.id::text AS id, v.skill_id::text AS skill_id, v.version_no, v.source_json, v.source_markdown, v.graph_json, v.normalized_json, v.status
          FROM agent_skill_versions v JOIN agent_skills s ON s.id = v.skill_id
          WHERE s.id = $1::uuid AND v.version_no = $4::int
            AND ((s.visibility = 'official' AND s.status = 'published' AND s.tenant_id IS NULL)
              OR (s.visibility = 'private' AND s.tenant_id = $2::uuid AND s.owner_user_id = $3::uuid))
            AND v.status = 'published' LIMIT 1`, [skillId, context.tenantId, context.userId, version]);
      const value = row.rows[0];
      return value ? { id: value.id, skillId: value.skill_id, version: Number(value.version_no), source: value.source_json, markdown: value.source_markdown, graph: value.graph_json, normalized: value.normalized_json, status: value.status } : null;
    }, this.pool);
  }

  async updateDraft(context: SkillDbContext, skillId: string, source: SkillSource, expectedRevision: number): Promise<SkillDraft> {
    return withTenantTransaction(context, async (client) => {
      const normalized = normalizeSkillSource(source);
      const projection = skillProjection(source, normalized);
      const update = await client.query<{ revision: number }>(`UPDATE agent_skills SET name = $4, summary = $5, modality = $6, revision = revision + 1, updated_at = now() WHERE id = $1::uuid AND tenant_id = $2::uuid AND owner_user_id = $3::uuid AND revision = $7 RETURNING revision`, [skillId, context.tenantId, context.userId, source.name, source.summary, source.modality, expectedRevision]);
      if (update.rowCount !== 1) throw new Error("SKILL_VERSION_CONFLICT");
      await client.query(`UPDATE agent_skill_versions SET source_json = $2::jsonb, source_markdown = $3, frontmatter_json = $4::jsonb, normalized_json = $5::jsonb, source_checksum = $6 WHERE skill_id = $1::uuid AND status = 'draft'`, [skillId, JSON.stringify(source), projection.markdown, JSON.stringify(projection.frontmatter), JSON.stringify(normalized), normalized.checksum]);
      return { id: skillId, ownerUserId: context.userId!, revision: Number(update.rows[0]!.revision), source };
    }, this.pool);
  }

  async publish(context: SkillDbContext, skillId: string, source: SkillSource, normalized: NormalizedSkill, expectedRevision?: number): Promise<SkillPreview> {
    return withTenantTransaction(context, async (client) => {
      const projection = skillProjection(source, normalized);
      const row = await client.query<{ version_no: number }>(`SELECT COALESCE(MAX(version_no), 0) + 1 AS version_no FROM agent_skill_versions WHERE skill_id = $1::uuid`, [skillId]);
      const version = Number(row.rows[0]?.version_no ?? 1);
      const versionResult = await client.query<{ id: string }>(`INSERT INTO agent_skill_versions (tenant_id, skill_id, version_no, source_json, source_markdown, frontmatter_json, normalized_json, source_checksum, status, created_by) VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb, $8, 'published', $9::uuid) RETURNING id::text AS id`, [context.tenantId, skillId, version, JSON.stringify(source), projection.markdown, JSON.stringify(projection.frontmatter), JSON.stringify(normalized), normalized.checksum, context.userId]);
      const skill = await client.query<{ id: string; name: string; modality: SkillSource["modality"]; status: string; summary: string; visibility: "private"; owner_user_id: string; }>(`UPDATE agent_skills SET status = 'published', current_version_id = $2::uuid, revision = revision + 1, updated_at = now() WHERE id = $1::uuid AND tenant_id = $3::uuid AND owner_user_id = $4::uuid${expectedRevision === undefined ? "" : " AND revision = $5"} RETURNING id::text AS id, name, modality, status, summary, visibility, owner_user_id::text AS owner_user_id`, expectedRevision === undefined ? [skillId, versionResult.rows[0]!.id, context.tenantId, context.userId] : [skillId, versionResult.rows[0]!.id, context.tenantId, context.userId, expectedRevision]);
      if (!skill.rows[0]) {
        if (expectedRevision !== undefined) {
          const current = await client.query<{ revision: number }>(`SELECT revision FROM agent_skills WHERE id = $1::uuid AND tenant_id = $2::uuid AND owner_user_id = $3::uuid`, [skillId, context.tenantId, context.userId]);
          if (current.rows[0]) throw new Error("SKILL_VERSION_CONFLICT");
        }
        throw new Error("SKILL_NOT_FOUND");
      }
      const value = skill.rows[0];
      return { id: value.id, modality: value.modality, name: value.name, ownerUserId: value.owner_user_id, status: value.status, summary: value.summary, version, visibility: value.visibility };
    }, this.pool);
  }

  async duplicate(context: SkillDbContext, skillId: string, source: SkillSource): Promise<SkillDraft> {
    return this.createDraft(context, source);
  }
}

function skillProjection(source: SkillSource, normalized: NormalizedSkill): { markdown: string; frontmatter: ReturnType<typeof parseSkillMarkdown>["frontmatter"] } {
  const markdown = serializeSkillMarkdown({
    approval_policy: normalized.approvalRules.beforeCreditRun ? "credit_required" : "auto",
    ...(source.category ? { category: source.category } : {}),
    compatible_graph_schema: "v2",
    description: source.summary,
    inputs: normalized.inputHints.map((item) => item.label),
    modality: source.modality,
    name: source.name,
    outputs: normalized.deliveryChecks,
    triggers: source.triggers ?? [],
  }, source.method);
  return { markdown, frontmatter: parseSkillMarkdown(markdown).frontmatter };
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "skill";
}
