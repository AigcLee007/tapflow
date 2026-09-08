import { listSkills } from "../../skillApi";
import { normalizeAgentSkillPickerItem, type AgentSkillPreview } from "../../canvasAgentApi";

export type SkillDisplayMetadata = Pick<AgentSkillPreview, "category" | "id" | "inputHints" | "modality" | "name" | "summary" | "version" | "visibility">;

export type SkillCatalogAdapter = (input?: { modality?: AgentSkillPreview["modality"]; q?: string; scope?: "available" | "mine" }) => Promise<readonly unknown[]>;

export class SkillController {
  private readonly listSkills: SkillCatalogAdapter;

  constructor(options: { listSkills?: SkillCatalogAdapter } = {}) {
    this.listSkills = options.listSkills ?? ((input) => listSkills(input));
  }

  async list(input?: Parameters<SkillCatalogAdapter>[0]): Promise<SkillDisplayMetadata[]> {
    const items = await this.listSkills(input);
    return items.flatMap((value) => {
      const skill = normalizeAgentSkillPickerItem(value);
      if (!skill || !Number.isFinite(skill.version) || !Number.isInteger(skill.version) || skill.version < 0) return [];
      return [skill];
    });
  }
}
