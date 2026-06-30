import type { CanvasAgentSnapshotInput } from "./agent.schemas.js";

export type AgentPlannerContextPayload = {
  prompt: string;
  snapshot: CanvasAgentSnapshotInput;
};

type NodeSummary = {
  assetId?: string;
  errorMessage?: string | null;
  id: string;
  kind: string;
  outputText?: string | null;
  position: { x: number; y: number };
  selected: boolean;
  status?: string;
  title: string;
};

export function buildAgentPlannerContext(payload: AgentPlannerContextPayload): string {
  const selectedIds = new Set(payload.snapshot.selectedNodeIds.filter((value) => typeof value === "string" && value.length > 0));
  const upstreamIds = collectUpstreamNodeIds(payload.snapshot, selectedIds);
  const downstreamIds = collectDownstreamNodeIds(payload.snapshot, selectedIds);

  return JSON.stringify({
    context: {
      canvas: summarizeCanvas(payload.snapshot),
      downstreamNodes: summarizeNodes(payload.snapshot, downstreamIds),
      nodeOutputs: payload.snapshot.nodeOutputs,
      pricing: [],
      recentRuns: [],
      selectedNodes: summarizeNodes(payload.snapshot, selectedIds),
      upstreamNodes: summarizeNodes(payload.snapshot, upstreamIds),
      visibleModels: [],
    },
    outputSchema: "CanvasAgentPlannerOutput",
    userGoal: payload.prompt,
  });
}

function summarizeCanvas(snapshot: CanvasAgentSnapshotInput) {
  return {
    edges: snapshot.edges.slice(0, 120),
    flowId: snapshot.flowId,
    nodeCount: snapshot.nodes.length,
    projectId: snapshot.projectId,
    selectedNodeIds: snapshot.selectedNodeIds,
    viewport: snapshot.viewport,
  };
}

function collectUpstreamNodeIds(snapshot: CanvasAgentSnapshotInput, selectedIds: Set<string>): Set<string> {
  const upstream = new Set<string>();
  const edgeMap = new Map(snapshot.edges.map((edge) => [edge.target, edge.source]));
  const queue = [...selectedIds];

  while (queue.length > 0 && upstream.size < 20) {
    const current = queue.shift()!;
    const source = edgeMap.get(current);
    if (!source || selectedIds.has(source) || upstream.has(source)) continue;
    upstream.add(source);
    queue.push(source);
  }

  return upstream;
}

function collectDownstreamNodeIds(snapshot: CanvasAgentSnapshotInput, selectedIds: Set<string>): Set<string> {
  const downstream = new Set<string>();
  const edgeMap = new Map<string, string[]>();
  snapshot.edges.forEach((edge) => {
    const list = edgeMap.get(edge.source) ?? [];
    list.push(edge.target);
    edgeMap.set(edge.source, list);
  });
  const queue = [...selectedIds];

  while (queue.length > 0 && downstream.size < 20) {
    const current = queue.shift()!;
    const targets = edgeMap.get(current) ?? [];
    for (const target of targets) {
      if (selectedIds.has(target) || downstream.has(target)) continue;
      downstream.add(target);
      queue.push(target);
    }
  }

  return downstream;
}

function summarizeNodes(snapshot: CanvasAgentSnapshotInput, nodeIds: Set<string>): NodeSummary[] {
  return snapshot.nodes
    .filter((node) => nodeIds.has(node.id))
    .slice(0, 20)
    .map((node) => ({
      assetId: node.assetId,
      errorMessage: node.errorMessage ?? null,
      id: node.id,
      kind: node.kind,
      outputText: snapshot.nodeOutputs[node.id]?.text ?? null,
      position: node.position,
      selected: node.selected,
      status: node.status,
      title: node.title,
    }));
}
