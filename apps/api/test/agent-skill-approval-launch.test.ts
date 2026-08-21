import { describe, expect, it, vi } from "vitest";

import { AgentService } from "../src/modules/agent/agent.service.js";
import type { SkillRunView, SkillStepView } from "../src/modules/agent/agent-skill-run.service.js";

const context = { tenantId: "tenant-1", userId: "user-1" };
const snapshot = { flowId: "flow-1", projectId: "project-1", nodes: [], edges: [], nodeOutputs: {}, selectedNodeIds: [], viewport: { x: 0, y: 0, zoom: 1 } } as never;

function makeStep(id: string, nodeId: string): SkillStepView {
  return { action: "image", approvalState: "pending", assetId: null, error: null, id, nodeId, output: {}, retryCount: 0, status: "pending", stepIndex: 0, workflowRunId: null };
}

function makeRun(overrides: Partial<SkillRunView> = {}): SkillRunView {
  return { approvalState: "pending", budgetSnapshot: {}, error: null, flowId: "flow-1", graphRevision: 4, id: "skill-run-1", idempotencyKey: "turn:skill", output: {}, projectId: "project-1", sessionId: "session-1", skillVersionId: "skill-version-1", status: "planned", steps: [], turnId: "turn-1", ...overrides };
}

describe("AgentService Skill approval launch", () => {
  it("returns waiting_for_approval without creating a workflow run", async () => {
    const createWorkflowRun = vi.fn();
    let run = makeRun();
    const steps: SkillStepView[] = [];
    const service = Object.create(AgentService.prototype) as AgentService;
    service.workflowRunAdapter = { runNodes: createWorkflowRun } as never;
    service.flowsService = { getFlowDraft: vi.fn(async () => ({ revision: 4, graph: { nodes: [{ id: "image-1", type: "image", data: {} }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } } })) } as never;
    service.skillRunService = {
      createStep: vi.fn(async (input) => { const step = makeStep(`step-${steps.length + 1}`, input.nodeId!); steps.push(step); return step; }),
      getRun: vi.fn(async () => run),
      replaceBudgetSnapshot: vi.fn(async (_ctx, _id, budgetSnapshot) => { run = { ...run, budgetSnapshot }; return run; }),
      updateStep: vi.fn(async () => steps[0]!),
      transition: vi.fn(async () => { run = { ...run, status: "waiting_for_approval" }; return run; }),
    } as never;

    const result = await (service as never as { executeV2Tool: Function }).executeV2Tool(context, "session-1", "turn-1", snapshot, { name: "canvas.run_nodes", callId: "call-1", arguments: { expectedRevision: 4, nodeIds: ["image-1"] } }, 4, "skill-run-1", "skill-version-1");
    expect(result).toMatchObject({ status: "waiting_for_approval", approvalId: "skill-run-1" });
    expect(createWorkflowRun).not.toHaveBeenCalled();
    expect(steps[0]).toMatchObject({ nodeId: "image-1" });
  });

  it("launches an approved plan once with a stable approval idempotency key", async () => {
    const runNodes = vi.fn(async () => ({ revision: 4, runs: [{ nodeId: "image-1", runId: "workflow-1", status: "queued" }] }));
    const step = { ...makeStep("step-1", "image-1"), status: "waiting_for_approval" as const };
    let run = makeRun({ status: "waiting_for_approval", budgetSnapshot: { approvalPlan: { batch: false, flowId: "flow-1", graphRevision: 4, requiresApproval: true, targets: [{ action: "image", nodeId: "image-1", priced: true }] } }, steps: [step] });
    const service = Object.create(AgentService.prototype) as AgentService;
    service.workflowRunAdapter = { runNodes } as never;
    service.flowsService = { getFlowDraft: vi.fn(async () => ({ revision: 4, graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } } })) } as never;
    service.sessionRepository = { getSession: vi.fn(async () => ({ id: "session-1", flowId: "flow-1", projectId: "project-1" })) } as never;
    const claim = vi.fn(async () => true);
    service.skillRunService = {
      approve: vi.fn(async () => { run = { ...run, status: "running", approvalState: "approved" }; return run; }),
      claimApprovalLaunch: claim,
      getRun: vi.fn(async () => run),
      transition: vi.fn(),
      updateStep: vi.fn(async (_ctx, _id, patch) => { run = { ...run, steps: [{ ...step, ...patch, workflowRunId: "workflow-1" }] }; return run.steps[0]!; }),
    } as never;
    const first = await service.approveV2SkillRun(context, "session-1", "skill-run-1");
    const second = await service.approveV2SkillRun(context, "session-1", "skill-run-1");
    expect(first).toMatchObject({ status: "running", approvalId: "skill-run-1" });
    expect(second).toMatchObject({ status: "running", approvalId: "skill-run-1" });
    expect(runNodes).toHaveBeenCalledTimes(1);
    expect(runNodes).toHaveBeenCalledWith(context, expect.objectContaining({ idempotencyKey: "skill-approval:skill-run-1" }));
    expect(claim).toHaveBeenCalledTimes(1);
  });
});
