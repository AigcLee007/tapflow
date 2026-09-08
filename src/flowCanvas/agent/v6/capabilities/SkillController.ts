import { listSkills } from "../../skillApi";
import type { AgentSkillPreview } from "../../canvasAgentApi";
import type { AgentSkillInputHint } from "../../canvasAgentSkillTypes";

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
      if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.summary !== "string" || typeof value.version !== "number" || typeof value.modality !== "string" || typeof value.visibility !== "string") return [];
      return [{
        ...(typeof value.category === "string" && value.category.trim() ? { category: value.category } : {}),
        id: value.id,
        ...(Array.isArray(value.inputHints) ? { inputHints: projectInputHints(value.inputHints) } : {}),
        modality: value.modality as AgentSkillPreview["modality"],
        name: value.name,
        summary: value.summary,
        version: value.version,
        visibility: value.visibility as AgentSkillPreview["visibility"],
      }];
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const skillInputKinds = new Set<AgentSkillInputHint["kind"]>(["asset", "choice", "number", "text"]);

function projectInputHints(value: unknown[]): AgentSkillInputHint[] {
  return value.flatMap((hint) => {
    if (!isRecord(hint) || typeof hint.kind !== "string" || !skillInputKinds.has(hint.kind as AgentSkillInputHint["kind"]) || typeof hint.label !== "string" || typeof hint.required !== "boolean") return [];
    return [{ kind: hint.kind as AgentSkillInputHint["kind"], label: hint.label, required: hint.required }];
  });
}
