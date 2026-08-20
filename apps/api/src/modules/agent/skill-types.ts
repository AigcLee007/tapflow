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
