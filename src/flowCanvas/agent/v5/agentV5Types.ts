/**
 * Public, provider-agnostic contracts for the V5 conversational Agent.
 *
 * These types intentionally contain stable product identifiers only. Provider
 * names, route keys, credentials and URLs belong to server-side execution and
 * must never cross the block boundary into the renderer.
 */

export const AGENT_V5_MAX_ITEMS = 12;
export const AGENT_V5_TEXT_MAX_LENGTH = 4_000;
export const AGENT_V5_LABEL_MAX_LENGTH = 400;
export const AGENT_V5_ID_MAX_LENGTH = 200;

export type AgentV5Phase =
  | "idle"
  | "understanding"
  | "waiting_for_choice"
  | "drafting_brief"
  | "waiting_for_confirmation"
  | "executing"
  | "presenting_results"
  | "refining"
  | "failed";

/** The two user-facing execution modes exposed by the V5 composer. */
export type AgentExecutionMode = "auto" | "manual_confirmation";

export type AgentOption = {
  id: string;
  label: string;
  description?: string;
};

export type BriefField = {
  label: string;
  value: string;
};

export type CapabilityKind = "skill" | "app";
export type CapabilityStatus = "available" | "unavailable" | "running";

export type CapabilitySummary = {
  id: string;
  name: string;
  description?: string;
  status?: CapabilityStatus;
};

export type ProgressStepStatus = "pending" | "running" | "completed" | "failed";

export type ProgressStep = {
  id: string;
  label: string;
  status: ProgressStepStatus;
  detail?: string;
};

export type ResultStatus = "ready" | "selected" | "failed";

export type ResultRef = {
  id: string;
  label: string;
  assetId?: string;
  nodeId?: string;
  status?: ResultStatus;
};

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
  | { type: "skill_card"; capability: CapabilitySummary }
  | { type: "app_card"; capability: CapabilitySummary }
  | { type: "confirmation_card"; title?: string; text: string; plan: ConfirmationPlan }
  | { type: "progress_card"; title?: string; steps: ProgressStep[] }
  | { type: "result_group"; title?: string; results: ResultRef[] }
  | { type: "divider" };

export type AgentContextAssetRef = {
  assetId: string;
  refId: string;
  label: string;
};

export type AgentContextSkillRef = {
  id: string;
  version: number;
};

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

export type AgentV5ExecutionPolicy = {
  /** Allows only low-risk, non-billing planning/execution in auto mode. */
  allowSafeAutoExecute?: boolean;
  allowPaidAutoExecute?: boolean;
  allowBatchAutoExecute?: boolean;
  allowCanvasWriteAutoExecute?: boolean;
  allowSkillAutoExecute?: boolean;
  allowAppAutoExecute?: boolean;
};

export type AgentV5Plan = ConfirmationPlan & {
  id?: string;
  steps?: string[];
};

export type AgentDecision =
  | {
      type: "execute";
      id?: string;
      decisionId?: string;
      costCredits?: number;
      batch?: boolean;
      writesCanvas?: boolean;
      skill?: boolean;
      app?: boolean;
      capability?: CapabilityKind;
      kind?: CapabilityKind;
      requiresConfirmation?: boolean;
    }
  | { type: "confirm"; decisionId?: string }
  | { type: "cancel"; decisionId?: string; reason?: string }
  | { type: "select_choice"; questionId?: string; optionIds: string[] }
  | { type: "update_brief"; field: string; value: string }
  | { type: "run_skill"; skillId: string; decisionId?: string }
  | { type: "execute_skill"; skillId: string; decisionId?: string }
  | { type: "invoke_app"; appId: string; decisionId?: string }
  | { type: "execute_app"; appId: string; decisionId?: string }
  | { type: "select_result"; resultId: string }
  | { type: "refine"; resultId?: string; prompt?: string };

export type AgentV5State = {
  phase: AgentV5Phase;
  mode: AgentExecutionMode;
  policy: AgentV5ExecutionPolicy;
  confirmed: boolean;
  prompt: string | null;
  pendingQuestionId: string | null;
  pendingDecision: AgentDecision | null;
  plan: AgentV5Plan | null;
  blocks: ConversationBlock[];
  contextSnapshot: AgentContextSnapshot;
  progress: ProgressStep[];
  results: ResultRef[];
  refiningResultId: string | null;
  error: string | null;
  sessionId?: string;
  turnId?: string;
};

export type AgentV5Event =
  | { type: "user_submitted"; prompt: string }
  | { type: "agent_asked_question"; questionId: string }
  | { type: "choice_submitted" | "choice_selected"; questionId?: string; optionIds?: string[] }
  | { type: "brief_started" }
  | { type: "brief_ready" | "plan_ready"; plan?: AgentV5Plan }
  | { type: "confirmation_granted"; decisionId?: string }
  | { type: "execution_started" }
  | { type: "execution_completed"; results?: ResultRef[]; blocks?: ConversationBlock[]; sessionId?: string; turnId?: string }
  | { type: "refine_requested"; resultId?: string }
  | { type: "turn_failed"; error?: string }
  | { type: "reset" };
