import type { CanvasSnapshot } from "./canvasAgentTypes";

type SnapshotNode = { data: Record<string, unknown>; id: string; selected?: boolean; type?: string };

const text = (value: unknown, max: number): string | null => {
  const result = typeof value === "string" ? value.trim().slice(0, max) : "";
  return result || null;
};

/**
 * Compact canvas snapshot sent with every agent message. Field limits match
 * the server schema (apps/api/src/modules/canvas-agent/canvas-agent.schemas.ts).
 */
export function buildCanvasSnapshot(state: { nodes: readonly SnapshotNode[]; version: number }): CanvasSnapshot {
  return {
    nodes: state.nodes.slice(0, 500).map((node) => ({
      assetId: text(node.data.assetId, 120),
      id: node.id.slice(0, 120),
      prompt: text(node.data.generationPrompt ?? node.data.text, 2000),
      status: text(node.data.status, 40),
      title: text(node.data.title, 200),
      type: (text(node.data.kind, 40) ?? text(node.type, 40) ?? "node"),
    })),
    revision: Number.isSafeInteger(state.version) && state.version >= 0 ? state.version : 0,
    selectedNodeIds: state.nodes.filter((node) => node.selected).map((node) => node.id.slice(0, 120)).slice(0, 200),
  };
}
