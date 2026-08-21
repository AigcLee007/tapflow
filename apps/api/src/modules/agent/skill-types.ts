export type SkillModality = "text" | "image" | "video";

export type SkillSource = {
  askWhen: string;
  category?: string;
  inputs: string;
  method: string;
  modality: SkillModality;
  name: string;
  outputs: string;
  summary: string;
  triggers?: string[];
  usageScenarios: string;
};

export type NormalizedSkillAction = "analyze" | "canvas" | "deliver" | "image" | "review" | "text" | "video";

/** Stable runtime names used by the executor while the persisted v1 contract keeps compact actions. */
export type SkillRuntimeAction = "analyze" | "create_canvas" | "generate_text" | "generate_image" | "generate_video" | "review" | "deliver";

export function toSkillRuntimeAction(action: NormalizedSkillAction): SkillRuntimeAction {
  if (action === "canvas") return "create_canvas";
  if (action === "text") return "generate_text";
  if (action === "image") return "generate_image";
  if (action === "video") return "generate_video";
  return action;
}

export type NormalizedSkill = {
  approvalRules: {
    beforeBatch: boolean;
    beforeCreditRun: true;
    beforeDelivery: boolean;
    beforeOverwrite: boolean;
  };
  checksum: string;
  deliveryChecks: string[];
  inputHints: Array<{
    key: string;
    kind: "asset" | "choice" | "number" | "text";
    label: string;
    required: boolean;
  }>;
  methodSteps: Array<{
    action: NormalizedSkillAction;
    id: string;
    instruction: string;
  }>;
  modality: SkillModality;
  version: 1;
};
