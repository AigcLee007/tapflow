import { normalizeSkillSource } from "./skill-normalizer.js";
import { skillSourceSchema } from "./skill-schemas.js";
import { SkillRepository, type SkillDbContext } from "./skill.repository.js";
import type { SkillSource } from "./skill-types.js";
import {
  parseSkillMarkdown,
  serializeSkillMarkdown,
  validateSkillGraphTemplate,
  type SkillGraphTemplate,
} from "@aigc-flow/workflow-core";

export class SkillService {
  readonly repository: Pick<SkillRepository, "createDraft" | "duplicate" | "getDraft" | "list" | "publish" | "updateDraft" | "getVersion">;

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

  async exportPackage(context: SkillDbContext, skillId: string): Promise<{ skillMd: string; graphJson?: SkillGraphTemplate }> {
    const version = await this.repository.getVersion(context, skillId);
    if (!version) throw new Error("SKILL_NOT_FOUND");
    const normalized = normalizeSkillSource(version.source);
    const skillMd = version.markdown?.trim() || serializeSkillMarkdown({
      approval_policy: normalized.approvalRules.beforeCreditRun ? "credit_required" : "auto",
      ...(version.source.category ? { category: version.source.category } : {}),
      compatible_graph_schema: "v2",
      description: version.source.summary,
      inputs: normalized.inputHints.map((item) => item.label),
      modality: version.source.modality,
      name: version.source.name,
      outputs: normalized.deliveryChecks,
      triggers: version.source.triggers ?? [],
    }, version.source.method);
    return version.graph ? { skillMd, graphJson: validateSkillGraphTemplate(version.graph) } : { skillMd };
  }

  async importPackage(context: SkillDbContext, pkg: { skillMd: string; graphJson?: unknown }) {
    const parsed = parseSkillMarkdown(pkg.skillMd);
    const source: SkillSource = {
      askWhen: "缺少必要输入时追问",
      ...(parsed.frontmatter.category ? { category: parsed.frontmatter.category } : {}),
      inputs: parsed.frontmatter.inputs.join("\n"),
      method: parsed.body.trim() || "分析需求\n完成创作\n检查输出",
      modality: parsed.frontmatter.modality,
      name: parsed.frontmatter.name,
      outputs: parsed.frontmatter.outputs.join("\n"),
      summary: parsed.frontmatter.description,
      triggers: parsed.frontmatter.triggers,
      usageScenarios: "通过 Skill 目录或触发词使用",
    };
    const valid = skillSourceSchema.parse(source);
    const graphJson = pkg.graphJson === undefined ? null : validateSkillGraphTemplate(pkg.graphJson);
    return this.repository.createDraft(context, valid, { graphJson });
  }

  async duplicate(context: SkillDbContext, skillId: string, source: SkillSource) {
    const valid = skillSourceSchema.parse(source);
    return this.repository.duplicate(context, skillId, valid);
  }
}
