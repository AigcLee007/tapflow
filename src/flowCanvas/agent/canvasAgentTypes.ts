import type { Edge, Viewport } from "@xyflow/react";

import type { FlowEdgeData, FlowNodeData, FlowNodeKind, FlowRuntimeNodeOutput } from "../types";

export type {
  AgentOption,
  BriefField,
  CapabilitySummary,
  ConversationBlock,
  ProgressStep,
  ResultRef,
} from "./conversation/ConversationBlockTypes";
export { normalizeConversationBlocks } from "./conversation/ConversationBlockTypes";

export type CanvasAgentPermissionLevel =
  | "read_only"
  | "safe_write"
  | "confirmed_write"
  | "credit_required"
  | "denied";

export type CanvasAgentOp =
  | {
      type: "add_node";
      clientId?: string;
      kind: FlowNodeKind;
      position: { x: number; y: number };
      data: Partial<FlowNodeData>;
      selected?: boolean;
    }
  | {
      type: "update_node_data";
      nodeId: string;
      patch: Partial<FlowNodeData>;
    }
  | {
      type: "delete_nodes";
      nodeIds: string[];
    }
  | {
      type: "connect_nodes";
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
    }
  | {
      type: "delete_edges";
      edgeIds: string[];
    }
  | {
      type: "select_nodes";
      nodeIds: string[];
    }
  | {
      type: "set_viewport";
      viewport: Viewport;
    }
  | {
      type: "run_node";
      nodeId: string;
      runMode: "target_node";
    };

export type CanvasAgentEvidence = {
  summary: string;
  type: "canvas" | "selection" | "asset" | "model" | "pricing" | "run";
};

export type CanvasAgentPlanStep = {
  reason: string;
  risk?: string;
  step: string;
};

export type CanvasAgentCostEstimate = {
  items: Array<{
    credits: number;
    label: string;
    quantity: number;
  }>;
  totalCredits: number;
};

export type CanvasAgentPlannerOutput = {
  approvalRequired: boolean;
  costEstimate?: CanvasAgentCostEstimate;
  evidence: CanvasAgentEvidence[];
  plan: CanvasAgentPlanStep[];
  proposedOps: CanvasAgentOp[];
  reply: string;
  sessionId?: string;
  turnId?: string;
};

export type CanvasAgentSnapshot = {
  edges: Array<
    Pick<Edge<FlowEdgeData>, "id" | "source" | "target"> & {
      sourceHandle?: string | null;
      targetHandle?: string | null;
    }
  >;
  flowId: string | null;
  nodeOutputs: Record<
    string,
    {
      errorMessage: string | null;
      text: string | null;
    }
  >;
  nodes: Array<{
    assetId?: string;
    errorMessage?: string;
    id: string;
    kind: FlowNodeKind;
    position: { x: number; y: number };
    selected: boolean;
    status?: string;
    title: string;
  }>;
  projectId: string | null;
  selectedNodeIds: string[];
  viewport: Viewport;
};

export type CanvasAgentOpSummary = {
  addNodeCount: number;
  connectCount: number;
  creditRunCount: number;
  deleteEdgeCount: number;
  deleteNodeCount: number;
  updateNodeCount: number;
};

export type AgentExecutionRequirement = "paid" | "batch" | "delete" | "broad_update";
export type AgentExecutionState = "idle" | "awaiting_confirmation" | "running" | "completed" | "failed";
export type AgentConversationState = {
  conversation?: "idle" | "understanding" | "asking" | "waiting_for_choice" | "summarizing" | "waiting_for_confirmation" | "executing" | "presenting_results" | "refining" | "completed" | "failed";
  execution: AgentExecutionState;
  requirement?: AgentExecutionRequirement;
};

export type ConversationEvent =
  | { type: "plan_ready"; execution?: { costCredits?: number; operationCount?: number; kind?: AgentExecutionRequirement } }
  | { type: "confirmation_granted" }
  | { type: "confirmation_rejected" }
  | { type: "execution_started" }
  | { type: "execution_completed" }
  | { type: "execution_failed" }
  | { type: "reset" };

export function getCanvasAgentOpPermission(op: CanvasAgentOp): CanvasAgentPermissionLevel {
  if (op.type === "run_node") return "credit_required";
  if (op.type === "delete_nodes" || op.type === "delete_edges" || op.type === "update_node_data") {
    return "confirmed_write";
  }
  return "safe_write";
}

export function summarizeCanvasAgentOps(ops: CanvasAgentOp[]): CanvasAgentOpSummary {
  return ops.reduce<CanvasAgentOpSummary>(
    (summary, op) => {
      if (op.type === "add_node") summary.addNodeCount += 1;
      if (op.type === "connect_nodes") summary.connectCount += 1;
      if (op.type === "delete_edges") summary.deleteEdgeCount += op.edgeIds.length;
      if (op.type === "delete_nodes") summary.deleteNodeCount += op.nodeIds.length;
      if (op.type === "run_node") summary.creditRunCount += 1;
      if (op.type === "update_node_data") summary.updateNodeCount += 1;
      return summary;
    },
    {
      addNodeCount: 0,
      connectCount: 0,
      creditRunCount: 0,
      deleteEdgeCount: 0,
      deleteNodeCount: 0,
      updateNodeCount: 0,
    },
  );
}
