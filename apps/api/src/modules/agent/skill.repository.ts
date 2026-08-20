import type { Pool, PoolClient } from "pg";

import { createPgPool, withTenantTransaction } from "@aigc-flow/db";

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
      if (filters.modality) { values.push(filters.modality); }
      if (filters.q) { values.push(`%${filters.q}%`); }
      const result = await client.query<{
        id: string; modality: SkillSource["modality"]; name: string; owner_user_id: string | null;
        status: string; summary: string; version: number; visibility: "official" | "private";
      }>(`SELECT s.id::text AS id, s.modality, s.name, s.owner_user_id::text AS owner_user_id, s.status, s.summary, COALESCE(v.version_no, 0) AS version, s.visibility FROM agent_skills s LEFT JOIN agent_skill_versions v ON v.id = s.current_version_id WHERE ${predicates}${filters.modality ? ` AND s.modality = $${values.length}::text` : ""}${filters.q ? ` AND (s.name ILIKE $${values.length}::text OR s.summary ILIKE $${values.length + (filters.modality ? 1 : 0)}::text)` : ""} ORDER BY s.updated_at DESC`, values);
      return result.rows.map((row) => ({ id: row.id, modality: row.modality, name: row.name, ownerUserId: row.owner_user_id, status: row.status, summary: row.summary, version: Number(row.version), visibility: row.visibility }));
    }, this.pool);
  }

  async createDraft(context: SkillDbContext, source: SkillSource): Promise<SkillDraft> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<{ id: string }>(`INSERT INTO agent_skills (tenant_id, owner_user_id, visibility, status, slug, name, summary, modality) VALUES ($1::uuid, $2::uuid, 'private', 'draft', $3, $4, $5, $6) RETURNING id::text AS id`, [context.tenantId, context.userId, slugify(source.name), source.name, source.summary, source.modality]);
      const id = result.rows[0]!.id;
      await client.query(`INSERT INTO agent_skill_versions (tenant_id, skill_id, version_no, source_json, normalized_json, source_checksum, status, created_by) VALUES ($1::uuid, $2::uuid, 1, $3::jsonb, '{}'::jsonb, '', 'draft', $4::uuid)`, [context.tenantId, id, JSON.stringify(source), context.userId]);
      return { id, ownerUserId: context.userId!, revision: 0, source };
    }, this.pool);
  }

  async getDraft(context: SkillDbContext, skillId: string): Promise<SkillDraft | null> {
    return withTenantTransaction(context, async (client) => {
      const row = await client.query<{ id: string; owner_user_id: string; revision: number; source_json: SkillSource }>(`SELECT s.id::text AS id, s.owner_user_id::text AS owner_user_id, s.revision, v.source_json FROM agent_skills s JOIN agent_skill_versions v ON v.skill_id = s.id AND v.status = 'draft' WHERE s.id = $1::uuid AND s.tenant_id = $2::uuid AND s.owner_user_id = $3::uuid ORDER BY v.version_no DESC LIMIT 1`, [skillId, context.tenantId, context.userId]);
      const value = row.rows[0];
      return value ? { id: value.id, ownerUserId: value.owner_user_id, revision: Number(value.revision), source: value.source_json } : null;
    }, this.pool);
  }

  async updateDraft(context: SkillDbContext, skillId: string, source: SkillSource, expectedRevision: number): Promise<SkillDraft> {
    return withTenantTransaction(context, async (client) => {
      const update = await client.query<{ revision: number }>(`UPDATE agent_skills SET name = $4, summary = $5, modality = $6, revision = revision + 1, updated_at = now() WHERE id = $1::uuid AND tenant_id = $2::uuid AND owner_user_id = $3::uuid AND revision = $7 RETURNING revision`, [skillId, context.tenantId, context.userId, source.name, source.summary, source.modality, expectedRevision]);
      if (update.rowCount !== 1) throw new Error("SKILL_VERSION_CONFLICT");
      await client.query(`UPDATE agent_skill_versions SET source_json = $2::jsonb WHERE skill_id = $1::uuid AND status = 'draft'`, [skillId, JSON.stringify(source)]);
      return { id: skillId, ownerUserId: context.userId!, revision: Number(update.rows[0]!.revision), source };
    }, this.pool);
  }

  async publish(context: SkillDbContext, skillId: string, source: SkillSource, normalized: NormalizedSkill): Promise<SkillPreview> {
    return withTenantTransaction(context, async (client) => {
      const row = await client.query<{ id: string; version_no: number }>(`SELECT id::text AS id, COALESCE(MAX(version_no), 0) + 1 AS version_no FROM agent_skill_versions WHERE skill_id = $1::uuid GROUP BY id LIMIT 1`, [skillId]);
      const version = Number(row.rows[0]?.version_no ?? 1);
      const versionResult = await client.query<{ id: string }>(`INSERT INTO agent_skill_versions (tenant_id, skill_id, version_no, source_json, normalized_json, source_checksum, status, created_by) VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5::jsonb, $6, 'published', $7::uuid) RETURNING id::text AS id`, [context.tenantId, skillId, version, JSON.stringify(source), JSON.stringify(normalized), normalized.checksum, context.userId]);
      const skill = await client.query<{ id: string; name: string; modality: SkillSource["modality"]; status: string; summary: string; visibility: "private"; owner_user_id: string; }>(`UPDATE agent_skills SET status = 'published', current_version_id = $2::uuid, updated_at = now() WHERE id = $1::uuid AND tenant_id = $3::uuid AND owner_user_id = $4::uuid RETURNING id::text AS id, name, modality, status, summary, visibility, owner_user_id::text AS owner_user_id`, [skillId, versionResult.rows[0]!.id, context.tenantId, context.userId]);
      if (!skill.rows[0]) throw new Error("SKILL_NOT_FOUND");
      const value = skill.rows[0];
      return { id: value.id, modality: value.modality, name: value.name, ownerUserId: value.owner_user_id, status: value.status, summary: value.summary, version, visibility: value.visibility };
    }, this.pool);
  }

  async duplicate(context: SkillDbContext, skillId: string, source: SkillSource): Promise<SkillDraft> {
    return this.createDraft(context, source);
  }
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "skill";
}
