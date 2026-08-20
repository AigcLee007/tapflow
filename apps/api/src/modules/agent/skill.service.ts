import { normalizeSkillSource } from "./skill-normalizer.js";
import { skillSourceSchema } from "./skill-schemas.js";
import { SkillRepository, type SkillDbContext } from "./skill.repository.js";
import type { SkillSource } from "./skill-types.js";

export class SkillService {
  readonly repository: Pick<SkillRepository, "createDraft" | "duplicate" | "getDraft" | "list" | "publish" | "updateDraft">;

  constructor(options: { repository?: SkillService["repository"] } = {}) {
    this.repository = options.repository ?? new SkillRepository();
  }

  async list(context: SkillDbContext, scope: "available" | "mine", filters: { modality?: string; q?: string } = {}) {
    return this.repository.list(context, scope, filters);
  }

  async createDraft(context: SkillDbContext, source: SkillSource) {
    const valid = skillSourceSchema.parse(source);
    normalizeSkillSource(valid);
    return this.repository.createDraft(context, valid);
  }

  async createAndPublish(context: SkillDbContext, source: SkillSource) {
    const valid = skillSourceSchema.parse(source);
    const normalized = normalizeSkillSource(valid);
    const draft = await this.repository.createDraft(context, valid);
    return this.repository.publish(context, draft.id, valid, normalized);
  }

  async getDraft(context: SkillDbContext, skillId: string) {
    const result = await this.repository.getDraft(context, skillId);
    if (!result) throw new Error("SKILL_NOT_FOUND");
    return result;
  }

  async updateDraft(context: SkillDbContext, skillId: string, source: SkillSource, expectedRevision: number) {
    const valid = skillSourceSchema.parse(source);
    normalizeSkillSource(valid);
    return this.repository.updateDraft(context, skillId, valid, expectedRevision);
  }

  async publish(context: SkillDbContext, skillId: string, source: SkillSource) {
    const valid = skillSourceSchema.parse(source);
    return this.repository.publish(context, skillId, valid, normalizeSkillSource(valid));
  }
}
