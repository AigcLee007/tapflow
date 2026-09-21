import type { AgentContinuationContext } from "./canvasAgentApi";
import type { AgentReferenceChip } from "./CanvasAgentWorkspaceTypes";
import type { AgentContextRef, AgentReferenceRole } from "./runtime/agentProtocol";

export type AgentReferenceContextItem = {
  assetId: string;
  kind: "artifact" | "canvas_node" | "upload";
  label: string;
  nodeId?: string;
  refId: string;
  role?: AgentReferenceRole;
};

export type AgentReferenceContext = {
  items: AgentReferenceContextItem[];
};

export const AGENT_REFERENCE_LIMIT = 8;

export function buildAgentReferenceContext(input: {
  chips: AgentReferenceChip[];
  continuationContext?: AgentContinuationContext | null;
}): AgentReferenceContext {
  const items: AgentReferenceContextItem[] = [];
  const seen = new Set<string>();

  for (const chip of input.chips) {
    if (!chip.assetId || !chip.refId) continue;
    if (seen.has(chip.refId)) continue;
    seen.add(chip.refId);
    items.push({
      assetId: chip.assetId,
      kind: chip.kind,
      label: chip.label,
      ...(chip.nodeId ? { nodeId: chip.nodeId } : {}),
      ...(((chip as AgentReferenceChip & { role?: AgentReferenceRole }).role) ? { role: (chip as AgentReferenceChip & { role?: AgentReferenceRole }).role } : {}),
      refId: chip.refId,
    });
  }

  const continuation = input.continuationContext;
  if (continuation) {
    const assetIds = continuation.assetIds?.length ? continuation.assetIds : [continuation.assetId];
    const refIds = continuation.assetRefIds?.length ? continuation.assetRefIds : [continuation.assetRefId];
    const labels = continuation.assetLabels?.length ? continuation.assetLabels : [continuation.assetLabel];

    for (let index = 0; index < assetIds.length; index += 1) {
      const assetId = assetIds[index];
      const refId = refIds[index];
      if (!assetId || !refId || seen.has(refId)) continue;
      seen.add(refId);
      items.push({
        assetId,
        kind: "artifact",
        label: labels[index] ?? `结果 ${index + 1}`,
        refId,
      });
    }
  }

  return { items: items.slice(0, AGENT_REFERENCE_LIMIT) };
}

/** Convert UI chips to the canonical stable reference protocol. */
export function buildStableAgentReferenceRefs(context: AgentReferenceContext): AgentContextRef[] {
  return context.items.map((item) => ({
    refId: item.refId,
    source: item.kind === "canvas_node" ? "canvas" : item.kind === "upload" ? "upload" : "asset",
    ...(item.nodeId ? { nodeId: item.nodeId } : {}),
    ...(item.assetId ? { assetId: item.assetId } : {}),
    ...(item.role ? { role: item.role } : {}),
    label: item.label,
  }));
}

export const buildAgentProtocolReferenceRefs = buildStableAgentReferenceRefs;
