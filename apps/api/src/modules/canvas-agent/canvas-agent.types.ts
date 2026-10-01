/**
 * Canvas Agent (tool-calling loop) shared types.
 * Plan: docs/superpowers/plans/2026-09-30-canvas-agent-tool-loop-rebuild.md
 */

export type CanvasAgentContext = {
  permissions: string[];
  tenantId: string;
  userId: string;
};

export type CanvasAgentMode = "auto" | "manual";
export type CanvasAgentSessionStatus = "idle" | "running" | "waiting";

export type CanvasAgentToolCall = { arguments: string; callId: string; name: string };

/** UI-only metadata stored with a message; never sent to the model. */
export type CanvasAgentDisplay = {
  durationMs?: number;
  ok?: boolean;
  summary?: string;
  title?: string;
  [key: string]: unknown;
};

export type CanvasAgentMessage = {
  content: string;
  createdAt: string;
  display: CanvasAgentDisplay | null;
  id: string;
  role: "assistant" | "tool" | "user";
  seq: number;
  toolCallId: string | null;
  toolCalls: CanvasAgentToolCall[] | null;
  toolName: string | null;
};

export type CanvasAgentNewMessage = Omit<CanvasAgentMessage, "createdAt" | "id" | "seq">;

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

/** The single interaction a paused loop is waiting on. */
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

export type CanvasAgentFile = {
  content: string;
  path: string;
  updatedAt: string;
  version: number;
};

/** Compact canvas snapshot the browser sends with each message. */
export type CanvasSnapshot = {
  nodes: Array<{
    assetId?: string | null;
    id: string;
    prompt?: string | null;
    status?: string | null;
    title?: string | null;
    type: string;
  }>;
  revision: number;
  selectedNodeIds: string[];
};

/** Events streamed to the browser over SSE. */
export type CanvasAgentEvent =
  | { type: "status"; phase: "organizing" | "running_tools" | "thinking" }
  | { type: "text_delta"; text: string }
  | { type: "tool_started"; callId: string; name: string; title: string }
  | { type: "tool_finished"; callId: string; durationMs: number; name: string; ok: boolean; summary?: string; title: string }
  | { type: "file_updated"; path: string; version: number }
  | { type: "waiting"; pending: CanvasAgentPending }
  | { type: "done"; reason: "cancelled" | "completed" | "round_limit" | "waiting" }
  | { type: "error"; code: string; message: string };

export class CanvasAgentError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = "CanvasAgentError";
  }
}
