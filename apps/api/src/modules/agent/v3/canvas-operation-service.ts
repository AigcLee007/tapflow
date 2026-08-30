import { canvasOperationEnvelopeSchema, type CanvasOperation, type CanvasOperationEnvelope } from "./canvas-operation-schema.js";

class CanvasOperationError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); }
}

type DraftGraph = { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[]; viewport: { x: number; y: number; zoom: number } };
type Draft = { revision: number; graph: DraftGraph };
type FlowsGateway = {
  getFlowDraft(context: { tenantId: string; userId: string | null }, flowId: string): Promise<Draft>;
  saveFlowDraft(context: { tenantId: string; userId: string | null }, flowId: string, input: { expectedRevision: number; graph: DraftGraph }): Promise<{ revision: number }>;
};

export type AppliedCanvasOperationSet = { revision: number; createdNodeIds: string[]; inverseOperations: CanvasOperation[] };

export class CanvasOperationService {
  private readonly completed = new Map<string, AppliedCanvasOperationSet>();

  constructor(private readonly flows: FlowsGateway) {}

  async applyApprovedOperationSet(input: { tenantId: string; projectId: string; flowId: string; taskId: string; operationSet: CanvasOperationEnvelope }): Promise<AppliedCanvasOperationSet> {
    const operationSet = canvasOperationEnvelopeSchema.parse(input.operationSet);
    if (operationSet.taskId !== input.taskId) throw new CanvasOperationError(400, "AGENT_OPERATION_TASK_MISMATCH", "Operation set task does not match the request.");
    const key = `${input.tenantId}:${input.flowId}:${operationSet.operationSetId}`;
    const existing = this.completed.get(key);
    if (existing) return existing;

    const context = { tenantId: input.tenantId, userId: null };
    const draft = await this.flows.getFlowDraft(context, input.flowId);
    if (draft.revision !== operationSet.baseRevision) throw new CanvasOperationError(409, "FLOW_DRAFT_REVISION_CONFLICT", "Canvas draft revision is stale.");

    const graph = structuredClone(draft.graph);
    const createdNodeIds: string[] = [];
    const inverseOperations: CanvasOperation[] = [];
    for (const operation of operationSet.operations) this.apply(graph, operation, createdNodeIds, inverseOperations);

    const saved = await this.flows.saveFlowDraft(context, input.flowId, { expectedRevision: operationSet.baseRevision, graph });
    const result = { revision: saved.revision, createdNodeIds, inverseOperations: inverseOperations.reverse() };
    this.completed.set(key, result);
    return result;
  }

  private apply(graph: DraftGraph, operation: CanvasOperation, createdNodeIds: string[], inverse: CanvasOperation[]) {
    if (operation.type === "node.create") { graph.nodes.push(operation.node); createdNodeIds.push(operation.node.id); inverse.push({ type: "node.delete", nodeId: operation.node.id }); return; }
    if (operation.type === "node.delete") { const index = graph.nodes.findIndex((node) => node.id === operation.nodeId); if (index < 0) throw new CanvasOperationError(409, "AGENT_OPERATION_PRECONDITION_FAILED", "Node is no longer available."); const [node] = graph.nodes.splice(index, 1); inverse.push({ type: "node.create", node: node as never }); return; }
    if (operation.type === "node.update_data") { const node = graph.nodes.find((item) => item.id === operation.nodeId); if (!node) throw new CanvasOperationError(409, "AGENT_OPERATION_PRECONDITION_FAILED", "Node is no longer available."); const previous = (node.data ?? {}) as Record<string, unknown>; node.data = { ...previous, ...operation.data }; inverse.push({ type: "node.update_data", nodeId: operation.nodeId, data: previous }); return; }
    if (operation.type === "edge.connect") { if (!graph.nodes.some((node) => node.id === operation.edge.source) || !graph.nodes.some((node) => node.id === operation.edge.target)) throw new CanvasOperationError(409, "AGENT_OPERATION_PRECONDITION_FAILED", "Edge endpoints are no longer available."); graph.edges.push(operation.edge); inverse.push({ type: "edge.delete", edgeId: operation.edge.id }); return; }
    if (operation.type === "edge.delete") { const index = graph.edges.findIndex((edge) => edge.id === operation.edgeId); if (index < 0) throw new CanvasOperationError(409, "AGENT_OPERATION_PRECONDITION_FAILED", "Edge is no longer available."); const [edge] = graph.edges.splice(index, 1); inverse.push({ type: "edge.connect", edge: edge as never }); return; }
    if (operation.type === "layout.move") { const node = graph.nodes.find((item) => item.id === operation.nodeId); if (!node) throw new CanvasOperationError(409, "AGENT_OPERATION_PRECONDITION_FAILED", "Node is no longer available."); const previous = node.position as { x: number; y: number }; node.position = operation.position; inverse.push({ type: "layout.move", nodeId: operation.nodeId, position: previous }); return; }
    throw new CanvasOperationError(400, "AGENT_OPERATION_UNSUPPORTED", `Unsupported operation: ${operation.type}`);
  }
}

export async function applyApprovedOperationSet(service: CanvasOperationService, input: Parameters<CanvasOperationService["applyApprovedOperationSet"]>[0]) {
  return service.applyApprovedOperationSet(input);
}
