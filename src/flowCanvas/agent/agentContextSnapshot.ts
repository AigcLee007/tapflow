import type { CanvasAgentSnapshot } from "./canvasAgentTypes";
import {
  normalizeAgentContextSnapshot,
  type AgentContextRef,
  type AgentContextSnapshot as CanonicalAgentContextSnapshot,
} from "./runtime/agentProtocol";

export type { AgentContextRef, CanonicalAgentContextSnapshot };

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

/**
 * Builds the server-facing snapshot. The older canvas snapshot above remains
 * available for V5/V6 compatibility, while new runtime code uses this
 * provider-neutral shape exclusively.
 */
export function buildStableAgentContextSnapshot(input: {
  appIds?: string[];
  flowId?: string | null;
  graphRevision: number;
  modelKey?: string | null;
  projectId: string | null;
  refs?: AgentContextRef[];
  skillIds?: string[];
}): CanonicalAgentContextSnapshot {
  return normalizeAgentContextSnapshot({
    appIds: input.appIds ?? [],
    flowId: input.flowId ?? null,
    graphRevision: input.graphRevision,
    modelKey: input.modelKey ?? null,
    projectId: input.projectId,
    refs: input.refs ?? [],
    skillIds: input.skillIds ?? [],
  });
}

export const buildAgentProtocolContextSnapshot = buildStableAgentContextSnapshot;
