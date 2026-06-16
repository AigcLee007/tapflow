import type { Edge, Node, Viewport } from "@xyflow/react";

import type { FlowEdgeData, FlowNodeData, FlowRuntimeNodeOutput } from "../types";
import type { CanvasAgentSnapshot } from "./canvasAgentTypes";

type SnapshotInput = {
  edges: Edge<FlowEdgeData>[];
  flowId: string | null;
  nodeOutputs: Record<string, FlowRuntimeNodeOutput>;
  nodes: Node<FlowNodeData>[];
  projectId: string | null;
  viewport: Viewport;
};

function compactRuntimeOutput(output: FlowRuntimeNodeOutput | undefined) {
  return {
    errorMessage: output?.errorMessage ?? null,
    text: typeof output?.text === "string" ? output.text.slice(0, 1200) : null,
  };
}

export function buildCanvasAgentSnapshot(input: SnapshotInput): CanvasAgentSnapshot {
  const selectedNodeIds = input.nodes.filter((node) => node.selected).map((node) => node.id);

  return {
    edges: input.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? null,
      target: edge.target,
      targetHandle: edge.targetHandle ?? null,
    })),
    flowId: input.flowId,
    nodeOutputs: Object.fromEntries(
      Object.entries(input.nodeOutputs).map(([nodeId, output]) => [nodeId, compactRuntimeOutput(output)]),
    ),
    nodes: input.nodes.map((node) => ({
      assetId: typeof node.data.assetId === "string" ? node.data.assetId : undefined,
      errorMessage: typeof node.data.errorMessage === "string" ? node.data.errorMessage.slice(0, 500) : undefined,
      id: node.id,
      kind: node.data.kind,
      position: node.position,
      selected: !!node.selected,
      status: typeof node.data.status === "string" ? node.data.status : undefined,
      title: String(node.data.title || node.data.kind || node.id).slice(0, 120),
    })),
    projectId: input.projectId,
    selectedNodeIds,
    viewport: input.viewport,
  };
}
