import { describe, expect, it, vi } from "vitest";
import { apiPost } from "../../../services/v2HttpClient";
import { submitAgentV5Decision, submitAgentV5Turn } from "./agentV5Api";

vi.mock("../../../services/v2HttpClient", () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
}));

describe("submitAgentV5Turn", () => {
  it("sends the current canvas graph revision instead of defaulting to zero", async () => {
    vi.mocked(apiPost).mockResolvedValue({ sessionId: "s", turnId: "t", phase: "understanding", blocks: [] });

    await submitAgentV5Turn("s", {
      prompt: "新任务",
      snapshot: {
        edges: [],
        flowId: "flow-1",
        graphRevision: 7,
        nodeOutputs: {},
        nodes: [],
        projectId: "project-1",
        selectedNodeIds: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    });

    expect(apiPost).toHaveBeenCalledWith("/agent/sessions/s/turns", expect.objectContaining({
      contextSnapshot: expect.objectContaining({ graphRevision: 7 }),
    }));
  });

  it("sends recovery actions as canonical retry decisions", async () => {
    vi.mocked(apiPost).mockResolvedValue({ sessionId: "s", turnId: "t", phase: "executing", blocks: [] });

    await submitAgentV5Decision("s", "t", { type: "retry_execution", graphRevision: 3, idempotencyKey: "retry-1" });

    expect(apiPost).toHaveBeenCalledWith("/agent/sessions/s/turns/t/decisions", {
      graphRevision: 3,
      idempotencyKey: "retry-1",
      payload: {},
      type: "retry_execution",
    });
  });
});
