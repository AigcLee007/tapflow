import { beforeEach, describe, expect, it } from "vitest";

import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { applyServerDraftToCanvas } from "./canvasAgentOps";

describe("agent canvas binding", () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().newProject();
    useFlowCanvasStore.getState().setBackendFlowBinding({
      backendFlowId: "flow-1",
      backendProjectId: "project-1",
    });
  });

  it("highlights created and updated nodes from a server-applied draft", () => {
    applyServerDraftToCanvas({
      createdNodeIds: ["node-created-1"],
      draft: {
        graph: {
          edges: [],
          nodes: [
            {
              data: {
                agentMetadata: {
                  agentSessionId: "session-1",
                  agentTurnId: "turn-1",
                },
                createdAt: 1,
                generationStatus: "idle",
                height: 180,
                kind: "text",
                status: "idle",
                title: "Agent prompt",
                updatedAt: 1,
                width: 240,
              },
              id: "node-created-1",
              position: { x: 120, y: 80 },
              type: "text",
            },
            {
              data: {
                agentMetadata: {
                  agentSessionId: "session-1",
                  agentTurnId: "turn-1",
                },
                createdAt: 1,
                generationPrompt: "forest sports day",
                generationStatus: "idle",
                height: 240,
                kind: "image",
                status: "idle",
                title: "Updated image",
                updatedAt: 1,
                width: 260,
              },
              id: "image-1",
              position: { x: 420, y: 80 },
              type: "image",
            },
          ],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        revision: 6,
      },
      highlightedNodeIds: ["image-1"],
    });

    const state = useFlowCanvasStore.getState();
    expect(state.nodes).toHaveLength(2);
    expect(state.nodes.find((node) => node.id === "node-created-1")?.selected).toBe(true);
    expect(state.nodes.find((node) => node.id === "image-1")?.selected).toBe(true);
    expect(state.nodes.find((node) => node.id === "node-created-1")?.data.agentMetadata).toEqual(
      expect.objectContaining({
        agentSessionId: "session-1",
        agentTurnId: "turn-1",
        highlightedAt: expect.any(Number),
      }),
    );
    expect(state.version).toBe(6);
  });
});
