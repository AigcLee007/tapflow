import { useCallback, useEffect, useState } from "react";

import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { AgentLoopView } from "./AgentLoopView";
import { canvasAgentApi } from "./canvasAgentApi";
import { buildCanvasSnapshot } from "./canvasAgentSnapshot";
import type { CanvasAgentImageModel } from "./canvasAgentTypes";
import { useCanvasAgent } from "./useCanvasAgent";

/**
 * Tool-calling canvas agent panel (enabled with VITE_CANVAS_AGENT_LOOP=true).
 * Plan: docs/superpowers/plans/2026-09-30-canvas-agent-tool-loop-rebuild.md
 */
export function AgentLoopPanel({ initialSessionId, onClose }: { initialSessionId?: string | null; onClose: () => void }) {
  const flowId = useFlowCanvasStore((state) => state.backendFlowId);
  const selectedCount = useFlowCanvasStore((state) => state.nodes.reduce((count, node) => count + (node.selected ? 1 : 0), 0));
  // Read the canvas at send time rather than re-rendering on every node change.
  const getCanvas = useCallback(() => buildCanvasSnapshot(useFlowCanvasStore.getState()), []);
  const agent = useCanvasAgent({ flowId, getCanvas });
  const [models, setModels] = useState<CanvasAgentImageModel[]>([]);

  useEffect(() => {
    if (!flowId) return;
    let alive = true;
    canvasAgentApi.listImageModels().then((result) => { if (alive) setModels(result); }).catch(() => undefined);
    return () => { alive = false; };
  }, [flowId]);

  const { openSession } = agent;
  useEffect(() => {
    if (initialSessionId) void openSession(initialSessionId);
  }, [initialSessionId, openSession]);

  return <AgentLoopView agent={agent} flowId={flowId} models={models} selectedCount={selectedCount} onClose={onClose} />;
}
