import { describe, expect, it, vi } from "vitest";
import { AgentV3RuntimeService, createAgentV3PlanningAdapter, type AgentV3RuntimeAdapter } from "../src/modules/agent/v3/agent-v3-runtime.js";

describe("AgentV3RuntimeService", () => {
  it("fails closed when the V3 runtime is disabled", async () => {
    const adapter: AgentV3RuntimeAdapter = { startTurn: vi.fn() };
    const runtime = new AgentV3RuntimeService({ enabled: false, adapter });

    await expect(runtime.startTurn({ sessionId: "session-1", input: { prompt: "test" }, writeChunk: vi.fn() }))
      .rejects.toMatchObject({ code: "AGENT_V3_UNAVAILABLE", statusCode: 503 });
    expect(adapter.startTurn).not.toHaveBeenCalled();
  });

  it("delegates an enabled turn to the injected runtime adapter", async () => {
    const startTurn = vi.fn().mockResolvedValue({ taskId: "task-1", status: "planning" });
    const runtime = new AgentV3RuntimeService({ enabled: true, adapter: { startTurn } });
    const writeChunk = vi.fn();

    const result = await runtime.startTurn({ sessionId: "session-1", input: { prompt: "test" }, writeChunk });

    expect(result).toEqual({ taskId: "task-1", status: "planning" });
    expect(startTurn).toHaveBeenCalledWith({ sessionId: "session-1", input: { prompt: "test" }, writeChunk });
  });

  it("persists observation, plan, and preview while using the real planner", async () => {
    const repository = {
      createTask: vi.fn().mockResolvedValue({ id: "task-1" }),
      appendEvent: vi.fn().mockResolvedValue({ seq: 1 }),
      updateTask: vi.fn().mockResolvedValue(undefined),
    };
    const agentService = {
      sessionRepository: { getSession: vi.fn().mockResolvedValue({ flowId: "flow-1", projectId: "project-1" }) },
      flowsService: { getFlowDraft: vi.fn().mockResolvedValue({ revision: 4 }) },
      plannerService: { planWithLlm: vi.fn().mockResolvedValue({ approvalRequired: true, plan: [{ step: "Create product set", reason: "requested" }], proposedOps: [], evidence: [], costEstimate: { items: [], totalCredits: 0 } }) },
    } as never;
    const writeChunk = vi.fn();

    const result = await createAgentV3PlanningAdapter(agentService, repository).startTurn({
      sessionId: "session-1",
      context: { tenantId: "tenant-1", userId: "user-1" },
      input: { prompt: "make a product set", snapshot: { projectId: "project-1", flowId: "flow-1", nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } } },
      writeChunk,
    });

    expect(result).toEqual({ taskId: "task-1", status: "waiting_for_approval" });
    expect(agentService.plannerService.planWithLlm).toHaveBeenCalled();
    expect(repository.appendEvent).toHaveBeenCalledTimes(3);
    expect(writeChunk).toHaveBeenCalledTimes(3);
  });
});
