/**
 * Browser copy of the canvas agent wire types
 * (server: apps/api/src/modules/canvas-agent/canvas-agent.types.ts).
 */

export type CanvasAgentMode = "auto" | "manual";
export type CanvasAgentSessionStatus = "idle" | "running" | "waiting";

export type CanvasAgentQuestion = {
  allowFreeText: boolean;
  id: string;
  options: Array<{ description?: string; id: string; label: string; recommended?: boolean }>;
  prompt: string;
  selection: "multiple" | "single";
  tag?: string;
};

export type CanvasAgentGenerationTask = {
  aspectRatio: string;
  count: number;
  prompt: string;
  referenceAssetIds: string[];
  size: "1K" | "2K" | "4K";
  title: string;
};

export type CanvasAgentGenerationPlan = {
  estimatedCredits: number;
  modelKey: string;
  routeKey: string;
  tasks: CanvasAgentGenerationTask[];
};

export type CanvasAgentPending =
  | { callId: string; kind: "questions"; questions: CanvasAgentQuestion[]; toolName: "ask_user" }
  | { callId: string; kind: "generation_approval"; plan: CanvasAgentGenerationPlan; toolName: "propose_generation" }
  | { callId: string; kind: "canvas_generate"; plan: CanvasAgentGenerationPlan; toolName: "propose_generation" };

export type CanvasAgentSession = {
  createdAt: string;
  flowId: string;
  id: string;
  messageSeq: number;
  mode: CanvasAgentMode;
  pending: CanvasAgentPending | null;
  projectId: string;
  status: CanvasAgentSessionStatus;
  textRouteKey: string | null;
  title: string;
  updatedAt: string;
};

export type CanvasAgentQuestionAnswer = { question: string; questionId: string; selected: string[]; text?: string };

export type CanvasAgentGenerationResult = {
  assetIds: string[];
  error?: string;
  nodeIds: string[];
  status: "cancelled" | "failed" | "succeeded";
  taskIndex: number;
  title?: string;
};

/** UI metadata stored on a tool message. */
export type CanvasAgentDisplay = {
  approved?: boolean;
  cancelled?: boolean;
  card?: {
    answers?: CanvasAgentQuestionAnswer[];
    approved?: boolean;
    kind: "generation" | "questions";
    plan?: CanvasAgentGenerationPlan;
    questions?: CanvasAgentQuestion[];
    results?: CanvasAgentGenerationResult[];
  };
  durationMs?: number;
  ok?: boolean;
  summary?: string;
  superseded?: boolean;
  title?: string;
};

export type CanvasAgentStoredMessage = {
  content: string;
  createdAt: string;
  display: CanvasAgentDisplay | null;
  id: string;
  role: "assistant" | "tool" | "user";
  seq: number;
  toolCallId: string | null;
  toolCalls: Array<{ callId: string; name: string }> | null;
  toolName: string | null;
};

export type CanvasAgentFileSummary = { chars: number; path: string; updatedAt: string; version: number };
export type CanvasAgentFile = { content: string; path: string; updatedAt: string; version: number };

export type CanvasSnapshot = {
  nodes: Array<{ assetId?: string | null; id: string; prompt?: string | null; status?: string | null; title?: string | null; type: string }>;
  revision: number;
  selectedNodeIds: string[];
};

export type CanvasAgentEvent =
  | { type: "status"; phase: "organizing" | "running_tools" | "thinking" }
  | { type: "text_delta"; text: string }
  | { type: "tool_started"; callId: string; name: string; title: string }
  | { type: "tool_finished"; callId: string; durationMs: number; name: string; ok: boolean; summary?: string; title: string }
  | { type: "file_updated"; path: string; version: number }
  | { type: "waiting"; pending: CanvasAgentPending }
  | { type: "done"; reason: "cancelled" | "completed" | "round_limit" | "waiting" }
  | { type: "error"; code: string; message: string };

export type CanvasAgentImageModel = {
  aspectRatios: string[];
  defaultRouteKey: string | null;
  displayName: string;
  modelKey: string;
  quantityOptions: number[];
  routes: Array<{ estimatedCredits: number; routeKey: string; routeLabel: string; sizes: Array<{ credits: number; size: "1K" | "2K" | "4K" }> }>;
  sizes: Array<"1K" | "2K" | "4K">;
};

/** Payload for resuming a generation approval card. */
export type CanvasAgentApprovalPayload = {
  approved: boolean;
  feedback?: string;
  overrides?: Partial<{ aspectRatio: string; count: number; modelKey: string; routeKey: string; size: "1K" | "2K" | "4K" }>;
  taskIndexes?: number[];
};

export type CanvasAgentAnswersPayload = { answers: Array<{ optionIds?: string[]; questionId: string; text?: string }> };
