import { randomUUID } from "node:crypto";

import type {
  AppendAgentSessionEventInput,
  AgentSessionLookup,
  AgentSessionRepository,
} from "./agent-session.repository.js";
import type { FlowsService, FlowDraftView } from "../flows/flows.service.js";
import { FlowsApiError, normalizeDraftGraph } from "../flows/flows.service.js";

type AgentContext = {
  tenantId: string;
  userId: string | null;
};

type DraftNode = {
  data?: Record<string, unknown>;
  id: string;
  position?: { x?: number; y?: number };
  type?: string;
  [key: string]: unknown;
};

type DraftEdge = {
  data?: Record<string, unknown>;
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
  type?: string;
  [key: string]: unknown;
};

export type AgentCanvasOp =
  | {
      type: "add_node";
      clientId?: string;
      kind: "text" | "image" | "video" | "audio" | "upload" | "image_editor" | "group";
      position: { x: number; y: number };
      data: Record<string, unknown>;
      selected?: boolean;
    }
  | {
      type: "update_node_data";
      nodeId: string;
      patch: Record<string, unknown>;
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
      viewport: { x: number; y: number; zoom: number };
    }
  | {
      type: "run_node";
      nodeId: string;
      runMode: "target_node";
    };

export type ApplyAgentCanvasOpsInput = {
  expectedRevision?: number;
  flowId: string;
  ops: AgentCanvasOp[];
  turnId: string;
};

export type ApplyAgentCanvasOpsResult = {
  applied: {
    createdNodeIds: string[];
    edgeIds: string[];
    runNodeIds: string[];
    updatedNodeIds: string[];
  };
  draft: FlowDraftView;
  event: unknown;
};

type SessionRepositoryLike = Pick<AgentSessionRepository, "appendSessionEvent"> & {
  getSession: (context: AgentContext, sessionId: string) => Promise<AgentSessionLookup>;
};

type FlowsServiceLike = Pick<FlowsService, "getFlowDraft" | "saveFlowDraft">;

const DEFAULT_NODE_SIZE: Record<
  "text" | "image" | "video" | "audio" | "upload" | "image_editor" | "group",
  { height: number; width: number }
> = {
  audio: { height: 180, width: 180 },
  group: { height: 400, width: 600 },
  image: { height: 240, width: 260 },
  image_editor: { height: 220, width: 220 },
  text: { height: 180, width: 280 },
  upload: { height: 220, width: 220 },
  video: { height: 260, width: 320 },
};

function isRevisionConflict(error: unknown) {
  return error instanceof FlowsApiError && error.code === "FLOW_DRAFT_REVISION_CONFLICT";
}

function resolveNodeId(value: string, clientNodeIds: Map<string, string>) {
  if (!value.startsWith("client:")) return value;
  return clientNodeIds.get(value.slice("client:".length)) ?? value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export class AgentCanvasService {
  private readonly now: () => number;
  private readonly randomId: () => string;

  constructor(private readonly options: {
    eventRepository: Pick<SessionRepositoryLike, "appendSessionEvent">;
    flowsService: FlowsServiceLike;
    now?: () => number;
    randomId?: () => string;
    sessionRepository: Pick<SessionRepositoryLike, "getSession">;
  }) {
    this.now = options.now ?? (() => Date.now());
    this.randomId = options.randomId ?? (() => randomUUID());
  }

  async applyOps(
    context: AgentContext,
    sessionId: string,
    input: ApplyAgentCanvasOpsInput,
  ): Promise<ApplyAgentCanvasOpsResult> {
    const session = await this.options.sessionRepository.getSession(context, sessionId);
    if (!session.flowId || session.flowId !== input.flowId) {
      throw new FlowsApiError(
        400,
        "AGENT_CANVAS_FLOW_MISMATCH",
        "Agent session is not bound to the requested flow.",
      );
    }

    let draft = await this.options.flowsService.getFlowDraft(context, input.flowId);
    let expectedRevision = input.expectedRevision ?? draft.revision;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const applied = this.applyOpsToDraft(sessionId, input.turnId, draft, input.ops);
      try {
        const saved = await this.options.flowsService.saveFlowDraft(context, input.flowId, {
          expectedRevision,
          graph: applied.graph,
        });
        const event = await this.appendCanvasAppliedEvent(context, sessionId, input.turnId, input.flowId, applied);
        return {
          applied: {
            createdNodeIds: applied.createdNodeIds,
            edgeIds: applied.createdEdgeIds,
            runNodeIds: applied.runNodeIds,
            updatedNodeIds: applied.updatedNodeIds,
          },
          draft: saved,
          event,
        };
      } catch (error) {
        if (!isRevisionConflict(error) || attempt >= 1) {
          throw error;
        }
        draft = await this.options.flowsService.getFlowDraft(context, input.flowId);
        expectedRevision = draft.revision;
      }
    }

    throw new FlowsApiError(500, "AGENT_CANVAS_APPLY_FAILED", "Unable to apply Agent canvas ops.");
  }

  private async appendCanvasAppliedEvent(
    context: AgentContext,
    sessionId: string,
    turnId: string,
    flowId: string,
    applied: {
      createdEdgeIds: string[];
      createdNodeIds: string[];
      runNodeIds: string[];
      updatedNodeIds: string[];
    },
  ) {
    const input: AppendAgentSessionEventInput = {
      eventJson: {
        createdNodeIds: applied.createdNodeIds,
        edgeIds: applied.createdEdgeIds,
        flowId,
        runNodeIds: applied.runNodeIds,
        updatedNodeIds: applied.updatedNodeIds,
      },
      eventType: "canvas_op_applied",
      sessionId,
      turnId,
    };
    return this.options.eventRepository.appendSessionEvent(context, input);
  }

  private applyOpsToDraft(
    sessionId: string,
    turnId: string,
    draft: FlowDraftView,
    ops: AgentCanvasOp[],
  ) {
    const graph = normalizeDraftGraph(draft.graph);
    const nodes = graph.nodes.map((node) => structuredClone(node)) as DraftNode[];
    const edges = graph.edges.map((edge) => structuredClone(edge)) as DraftEdge[];
    const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
    const edgeById = new Map(edges.map((edge) => [String(edge.id), edge]));
    const clientNodeIds = new Map<string, string>();
    const createdNodeIds: string[] = [];
    const createdEdgeIds: string[] = [];
    const updatedNodeIds = new Set<string>();
    const runNodeIds: string[] = [];

    for (const op of ops) {
      if (op.type === "add_node") {
        const nodeId = this.randomId();
        const size = DEFAULT_NODE_SIZE[op.kind];
        const selected = op.selected === true;
        const node: DraftNode = {
          data: {
            createdAt: this.now(),
            generationStatus: "idle",
            height: size.height,
            kind: op.kind,
            status: "idle",
            title: typeof op.data.title === "string" ? op.data.title : op.kind,
            updatedAt: this.now(),
            width: size.width,
            ...op.data,
            agentMetadata: {
              ...asRecord(op.data.agentMetadata),
              agentSessionId: sessionId,
              agentTurnId: turnId,
            },
          },
          id: nodeId,
          position: { x: op.position.x, y: op.position.y },
          selected,
          type: op.kind,
        };
        nodes.push(node);
        nodeById.set(nodeId, node);
        createdNodeIds.push(nodeId);
        if (op.clientId) {
          clientNodeIds.set(op.clientId, nodeId);
        }
        continue;
      }

      if (op.type === "update_node_data") {
        const nodeId = resolveNodeId(op.nodeId, clientNodeIds);
        const node = nodeById.get(nodeId);
        if (!node) {
          throw new FlowsApiError(400, "AGENT_CANVAS_NODE_NOT_FOUND", `Node ${nodeId} was not found in the flow draft.`);
        }
        node.data = {
          ...asRecord(node.data),
          ...op.patch,
          agentMetadata: {
            ...asRecord(asRecord(node.data).agentMetadata),
            ...asRecord(op.patch.agentMetadata),
            agentSessionId: sessionId,
            agentTurnId: turnId,
          },
          updatedAt: this.now(),
        };
        updatedNodeIds.add(nodeId);
        continue;
      }

      if (op.type === "delete_nodes") {
        const ids = op.nodeIds.map((nodeId) => resolveNodeId(nodeId, clientNodeIds));
        ids.forEach((nodeId) => {
          if (!nodeById.has(nodeId)) {
            throw new FlowsApiError(400, "AGENT_CANVAS_NODE_NOT_FOUND", `Node ${nodeId} was not found in the flow draft.`);
          }
        });
        for (let index = nodes.length - 1; index >= 0; index -= 1) {
          if (ids.includes(String(nodes[index]?.id))) {
            nodeById.delete(String(nodes[index]!.id));
            nodes.splice(index, 1);
          }
        }
        for (let index = edges.length - 1; index >= 0; index -= 1) {
          const edge = edges[index]!;
          if (ids.includes(edge.source) || ids.includes(edge.target)) {
            edgeById.delete(edge.id);
            edges.splice(index, 1);
          }
        }
        continue;
      }

      if (op.type === "connect_nodes") {
        const source = resolveNodeId(op.source, clientNodeIds);
        const target = resolveNodeId(op.target, clientNodeIds);
        if (!nodeById.has(source)) {
          throw new FlowsApiError(400, "AGENT_CANVAS_NODE_NOT_FOUND", `Node ${source} was not found in the flow draft.`);
        }
        if (!nodeById.has(target)) {
          throw new FlowsApiError(400, "AGENT_CANVAS_NODE_NOT_FOUND", `Node ${target} was not found in the flow draft.`);
        }
        const edgeId = this.randomId();
        const edge: DraftEdge = {
          data: { dataType: "any" },
          id: edgeId,
          source,
          sourceHandle: op.sourceHandle ?? "out",
          target,
          targetHandle: op.targetHandle ?? "in",
          type: "smart",
        };
        edges.push(edge);
        edgeById.set(edgeId, edge);
        createdEdgeIds.push(edgeId);
        continue;
      }

      if (op.type === "delete_edges") {
        op.edgeIds.forEach((edgeId) => {
          if (!edgeById.has(edgeId)) {
            throw new FlowsApiError(400, "AGENT_CANVAS_EDGE_NOT_FOUND", `Edge ${edgeId} was not found in the flow draft.`);
          }
        });
        for (let index = edges.length - 1; index >= 0; index -= 1) {
          const edge = edges[index]!;
          if (op.edgeIds.includes(edge.id)) {
            edgeById.delete(edge.id);
            edges.splice(index, 1);
          }
        }
        continue;
      }

      if (op.type === "select_nodes") {
        const ids = op.nodeIds.map((nodeId) => resolveNodeId(nodeId, clientNodeIds));
        ids.forEach((nodeId) => {
          if (!nodeById.has(nodeId)) {
            throw new FlowsApiError(400, "AGENT_CANVAS_NODE_NOT_FOUND", `Node ${nodeId} was not found in the flow draft.`);
          }
        });
        nodes.forEach((node) => {
          node.selected = ids.includes(String(node.id));
        });
        continue;
      }

      if (op.type === "set_viewport") {
        graph.viewport = {
          x: op.viewport.x,
          y: op.viewport.y,
          zoom: op.viewport.zoom,
        };
        continue;
      }

      if (op.type === "run_node") {
        const nodeId = resolveNodeId(op.nodeId, clientNodeIds);
        if (!nodeById.has(nodeId)) {
          throw new FlowsApiError(400, "AGENT_CANVAS_NODE_NOT_FOUND", `Node ${nodeId} was not found in the flow draft.`);
        }
        runNodeIds.push(nodeId);
      }
    }

    return {
      createdEdgeIds,
      createdNodeIds,
      graph: {
        ...graph,
        edges,
        nodes,
      },
      runNodeIds,
      updatedNodeIds: Array.from(updatedNodeIds),
    };
  }
}
