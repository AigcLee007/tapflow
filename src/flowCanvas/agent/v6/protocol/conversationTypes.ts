export const AGENT_V6_MAX_ITEMS = 12;
export const AGENT_V6_TEXT_MAX_LENGTH = 4_000;
export const AGENT_V6_LABEL_MAX_LENGTH = 400;
export const AGENT_V6_ID_MAX_LENGTH = 128;

export type AgentV6Phase =
  | "idle"
  | "understanding"
  | "waiting_for_choice"
  | "drafting_brief"
  | "waiting_for_confirmation"
  | "executing"
  | "verifying"
  | "presenting_results"
  | "refining"
  | "failed";

export type AgentExecutionMode = "auto" | "manual_confirmation";
export type AgentExecutionState = "idle" | "running" | "verifying" | "completed" | "failed";

export type AgentOption = { id: string; label: string; description?: string };
export type BriefField = { label: string; value: string };
export type ProgressStepStatus = "pending" | "running" | "completed" | "failed";
export type ProgressStep = { id: string; label: string; status: ProgressStepStatus; detail?: string };
export type ResultStatus = "ready" | "selected" | "failed";
export type ResultRef = { id: string; label: string; assetId?: string; nodeId?: string; refId?: string; uploadedAssetIds?: string[]; status?: ResultStatus };

export type ConfirmationPlan = {
  title?: string;
  summary?: string;
  costCredits?: number;
  batch?: boolean;
  writesCanvas?: boolean;
  skill?: boolean;
  app?: boolean;
};

export type ConversationBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "quote"; text: string }
  | { type: "bullet_list"; items: string[] }
  | { type: "numbered_list"; items: string[] }
  | { type: "choice_grid"; id?: string; title?: string; options: AgentOption[]; selectionMode: "single" | "multiple" }
  | { type: "comparison_table"; title?: string; columns: string[]; rows: string[][] }
  | { type: "brief_card"; title?: string; fields: BriefField[]; editable: boolean }
  | { type: "confirmation_card"; title?: string; text: string; plan: ConfirmationPlan }
  | { type: "progress_card"; title?: string; steps: ProgressStep[] }
  | { type: "result_group"; title?: string; results: ResultRef[] }
  | { type: "divider" };

export type AgentContextAssetRef = { assetId: string; refId: string; label: string; nodeId?: string };
export type AgentContextSkillRef = { id: string; version: number };
export type AgentContextSnapshot = {
  projectId: string | null;
  flowId: string | null;
  selectedNodeIds: string[];
  assetRefs: AgentContextAssetRef[];
  uploadedAssetIds: string[];
  skillRefs: AgentContextSkillRef[];
  appRefs: string[];
  modelKey: string | null;
  graphRevision: number;
};

export type AgentDecisionMetadata = {
  decisionId: string;
  sessionId: string;
  turnId: string;
  graphRevision: number;
  payload: Record<string, unknown>;
  idempotencyKey: string;
};

export type AgentDecision = AgentDecisionMetadata & (
  | { type: "execute"; costCredits?: number; batch?: boolean; writesCanvas?: boolean; skill?: boolean; app?: boolean; requiresConfirmation?: boolean }
  | { type: "confirm" }
  | { type: "cancel"; reason?: string }
  | { type: "select_choice"; questionId?: string; optionIds: string[] }
  | { type: "update_brief"; field: string; value: string }
  | { type: "refine"; resultId?: string; prompt?: string }
);

export type ConversationState = {
  phase: AgentV6Phase;
  executionState: AgentExecutionState;
  mode: AgentExecutionMode;
  prompt: string | null;
  pendingQuestionId: string | null;
  pendingDecision: AgentDecision | null;
  plan: ConfirmationPlan | null;
  confirmed: boolean;
  blocks: ConversationBlock[];
  contextSnapshot: AgentContextSnapshot;
  progress: ProgressStep[];
  results: ResultRef[];
  refiningResultId: string | null;
  graphRevision: number;
  error: string | null;
  sessionId?: string;
  turnId?: string;
};
