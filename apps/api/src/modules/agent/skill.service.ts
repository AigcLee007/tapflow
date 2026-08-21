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
import { instantiateSkillGraphTemplate } from "./skill-graph-instantiator.js";

export class SkillService {
  readonly repository: Pick<SkillRepository, "createDraft" | "duplicate" | "getDraft" | "list" | "publish" | "updateDraft" | "getVersion" | "getVersionByNumber">;

  constructor(options: { repository?: SkillService["repository"] } = {}) {
    if (options.repository) {
      this.repository = options.repository;
      return;
    }

    let repository: SkillService["repository"] | undefined;
    const getRepository = () => (repository ??= new SkillRepository());
    this.repository = {
      createDraft: (...args) => getRepository().createDraft(...args),
      duplicate: (...args) => getRepository().duplicate(...args),
      getDraft: (...args) => getRepository().getDraft(...args),
      list: (...args) => getRepository().list(...args),
      publish: (...args) => getRepository().publish(...args),
      updateDraft: (...args) => getRepository().updateDraft(...args),
      getVersion: (...args) => getRepository().getVersion(...args),
      getVersionByNumber: (...args) => getRepository().getVersionByNumber(...args),
    };
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
    if (result) return result;
    // Official Skills have no tenant-owned draft, but the detail surface still
    // needs the published creator-facing source for preview and selection.
    const published = await this.repository.getVersion(context, skillId);
    if (!published) throw new Error("SKILL_NOT_FOUND");
    return { id: skillId, ownerUserId: context.userId!, revision: 0, source: published.source };
  }

  async getPublishedVersion(context: SkillDbContext, skillId: string) {
    const result = await this.repository.getVersion(context, skillId);
    if (!result || result.status !== "published") throw new Error("SKILL_NOT_FOUND");
    return result;
  }

  async getPublishedVersionByNumber(context: SkillDbContext, skillId: string, version: number) {
    const result = await this.repository.getVersionByNumber(context, skillId, version);
    if (!result || result.status !== "published") throw new Error("SKILL_NOT_FOUND");
    return result;
  }

  async updateDraft(context: SkillDbContext, skillId: string, source: SkillSource, expectedRevision: number) {
    const valid = skillSourceSchema.parse(source);
    normalizeSkillSource(valid);
    return this.repository.updateDraft(context, skillId, valid, expectedRevision);
  }

  async publish(context: SkillDbContext, skillId: string, source: SkillSource, expectedRevision?: number) {
    const valid = skillSourceSchema.parse(source);
    return this.repository.publish(context, skillId, valid, normalizeSkillSource(valid), expectedRevision);
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

  async instantiateGraph(context: SkillDbContext, skillId: string, inputs: Record<string, unknown>) {
    const version = await this.getPublishedVersion(context, skillId);
    if (!version.graph) throw new Error("SKILL_GRAPH_TEMPLATE_UNAVAILABLE");
    return instantiateSkillGraphTemplate(version.graph, inputs);
  }
}
