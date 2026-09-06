import type { CanvasAgentSnapshot } from "./canvasAgentTypes";

export type AgentContextSnapshot = {
  assetIds: string[];
  appIds: string[];
  flowId: string | null;
  graphRevision: number;
  projectId: string | null;
  selectedNodeIds: string[];
  skillIds: string[];
};

export function buildAgentContextSnapshot(input: {
  appIds?: string[];
  assetIds?: string[];
  graphRevision: number;
  projectId: string | null;
  selectedNodeIds?: string[];
  skillIds?: string[];
  snapshot: Pick<CanvasAgentSnapshot, "flowId" | "nodes" | "selectedNodeIds">;
}): AgentContextSnapshot {
  const assetIds = new Set(input.assetIds ?? []);
  for (const node of input.snapshot.nodes) if (node.assetId) assetIds.add(node.assetId);
  const selectedNodeIds = [...new Set(input.selectedNodeIds ?? input.snapshot.selectedNodeIds)].sort();
  return {
    appIds: [...new Set(input.appIds ?? [])].sort(),
    assetIds: [...assetIds].sort(),
    flowId: input.snapshot.flowId,
    graphRevision: Number.isSafeInteger(input.graphRevision) && input.graphRevision >= 0 ? input.graphRevision : 0,
    projectId: input.projectId,
    selectedNodeIds,
    skillIds: [...new Set(input.skillIds ?? [])].sort(),
  };
}

export function isSnapshotCurrent(snapshot: AgentContextSnapshot, current: Pick<AgentContextSnapshot, "flowId" | "graphRevision" | "projectId">): boolean {
  return snapshot.flowId === current.flowId
    && snapshot.projectId === current.projectId
    && snapshot.graphRevision === current.graphRevision;
}
