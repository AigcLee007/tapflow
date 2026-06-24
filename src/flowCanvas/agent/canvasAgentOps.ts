import { getBackendRunLaunchErrorMessage } from "../runtime/v2WorkflowRunner";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import type { CanvasAgentOp } from "./canvasAgentTypes";
import type { CanvasAgentToolAssetRef } from "./canvasAgentToolTypes";

type ApplyInput = {
  ops: CanvasAgentOp[];
  runNode: (nodeId: string) => Promise<void>;
};

type ApplyResult = {
  createdNodeIds: string[];
  errors: Array<{
    message: string;
    op: CanvasAgentOp;
  }>;
  ok: boolean;
  ranNodeIds: string[];
};

function resolveNodeId(value: string, clientNodeIds: Map<string, string>) {
  return value.startsWith("client:") ? clientNodeIds.get(value.slice("client:".length)) ?? value : value;
}

export async function applyCanvasAgentOps(input: ApplyInput): Promise<ApplyResult> {
  const createdNodeIds: string[] = [];
  const ranNodeIds: string[] = [];
  const errors: ApplyResult["errors"] = [];
  const clientNodeIds = new Map<string, string>();

  for (const op of input.ops) {
    try {
      if (op.type === "add_node") {
        const node = useFlowCanvasStore
          .getState()
          .addNode(op.kind, op.position, op.data, { preserveSelection: true, selected: op.selected });
        createdNodeIds.push(node.id);
        if (op.clientId) clientNodeIds.set(op.clientId, node.id);
      }

      if (op.type === "update_node_data") {
        useFlowCanvasStore.getState().updateNodeData(resolveNodeId(op.nodeId, clientNodeIds), op.patch);
      }

      if (op.type === "connect_nodes") {
        useFlowCanvasStore.getState().connectNodes(
          resolveNodeId(op.source, clientNodeIds),
          resolveNodeId(op.target, clientNodeIds),
          op.sourceHandle,
          op.targetHandle,
        );
      }

      if (op.type === "delete_edges") {
        useFlowCanvasStore.getState().removeEdgesByIds(op.edgeIds);
      }

      if (op.type === "delete_nodes") {
        useFlowCanvasStore
          .getState()
          .removeNodesByIds(op.nodeIds.map((nodeId) => resolveNodeId(nodeId, clientNodeIds)));
      }

      if (op.type === "select_nodes") {
        useFlowCanvasStore
          .getState()
          .selectNodesByIds(op.nodeIds.map((nodeId) => resolveNodeId(nodeId, clientNodeIds)));
      }

      if (op.type === "set_viewport") {
        useFlowCanvasStore.getState().setViewport(op.viewport);
      }

      if (op.type === "run_node") {
        const nodeId = resolveNodeId(op.nodeId, clientNodeIds);
        await input.runNode(nodeId);
        ranNodeIds.push(nodeId);
      }
    } catch (error) {
      errors.push({
        message:
          op.type === "run_node"
            ? getBackendRunLaunchErrorMessage(error)
            : error instanceof Error
              ? error.message
              : String(error),
        op,
      });
    }
  }

  return {
    createdNodeIds,
    errors,
    ok: errors.length === 0,
    ranNodeIds,
  };
}

export function placeAgentGeneratedAssetsOnCanvas(input: {
  assets: CanvasAgentToolAssetRef[];
  sessionId: string | null;
  toolCallId: string;
  turnId: string | null;
}) {
  const createdNodeIds: string[] = [];
  const state = useFlowCanvasStore.getState();
  const baseX = -state.viewport.x / state.viewport.zoom + 120;
  const baseY = -state.viewport.y / state.viewport.zoom + 160;
  const reusableAgentTarget = state.nodes.find((node) =>
    node.selected &&
    node.data.kind === "image" &&
    typeof node.data.assetId !== "string" &&
    (node.data.agentMetadata as { creationStage?: unknown } | undefined)?.creationStage === "agent_auto_target",
  );

  input.assets.forEach((asset, index) => {
    if (asset.kind !== "image") return;
    if (index === 0 && reusableAgentTarget) {
      useFlowCanvasStore.getState().updateNodeData(reusableAgentTarget.id, {
        agent: {
          sessionId: input.sessionId,
          toolCallId: input.toolCallId,
          turnId: input.turnId,
        },
        agentMetadata: {
          ...(reusableAgentTarget.data.agentMetadata && typeof reusableAgentTarget.data.agentMetadata === "object"
            ? reusableAgentTarget.data.agentMetadata
            : {}),
          creationStage: "agent_result",
          productionLayer: "results",
        },
        assetId: asset.assetId,
        generationStatus: "done",
        promptSummary: asset.promptSummary,
        status: "succeeded",
        title: asset.label,
      });
      createdNodeIds.push(reusableAgentTarget.id);
      return;
    }
    const node = useFlowCanvasStore.getState().addNode(
      "image",
      { x: baseX + index * 340, y: baseY },
      {
        agent: {
          sessionId: input.sessionId,
          toolCallId: input.toolCallId,
          turnId: input.turnId,
        },
        assetId: asset.assetId,
        promptSummary: asset.promptSummary,
        title: asset.label,
      },
      { preserveSelection: true, selected: index === 0 },
    );
    createdNodeIds.push(node.id);
  });

  return { createdNodeIds };
}
