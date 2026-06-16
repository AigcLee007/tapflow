import type { CanvasAgentSnapshotInput } from "./agent.schemas.js";

export type AgentPlannerContextPayload = {
  prompt: string;
  snapshot: CanvasAgentSnapshotInput;
};

export function buildAgentPlannerContext(payload: AgentPlannerContextPayload): string {
  return JSON.stringify({
    context: {
      canvas: payload.snapshot,
      recentRuns: [],
      selectedNodes: payload.snapshot.nodes.filter((node) => node.selected),
      visibleModels: [],
      pricing: [],
    },
    outputSchema: "CanvasAgentPlannerOutput",
    userGoal: payload.prompt,
  });
}
