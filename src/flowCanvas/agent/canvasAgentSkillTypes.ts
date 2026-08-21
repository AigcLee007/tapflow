export type AgentSkillModality = "text" | "image" | "video";

export type AgentSkillInputHint = {
  label: string;
  kind: "asset" | "choice" | "number" | "text";
  required: boolean;
};

/** Fields safe for rendering and sending back as Skill identity. */
export type AgentSkillPickerItem = {
  id: string;
  version: number;
  name: string;
  summary: string;
  modality: AgentSkillModality;
  category?: string;
  inputHints: AgentSkillInputHint[];
};

export type AgentSkillPlanStatus =
  | "draft"
  | "waiting_for_approval"
  | "running"
  | "succeeded"
  | "partial_success"
  | "failed"
  | "cancelled";

export type AgentSkillStepStatus =
  | "pending"
  | "waiting_for_approval"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type AgentSkillPlanAction = "text" | "image" | "video" | "canvas" | "review" | "deliver";

export type AgentSkillStep = {
  id: string;
  index: number;
  action: AgentSkillPlanAction;
  label: string;
  nodeId?: string | null;
  assetId?: string | null;
  status: AgentSkillStepStatus;
  error?: string;
};

export type AgentSkillPlan = {
  id: string;
  status: AgentSkillPlanStatus;
  estimatedCredits?: number;
  steps: AgentSkillStep[];
};

export type SkillWorkbenchState = {
  selectedSkill: AgentSkillPickerItem | null;
  pickerOpen: boolean;
  plan: AgentSkillPlan | null;
  unavailableReason?: string;
};
