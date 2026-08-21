import { describe, expect, it, vi } from "vitest";

import { SkillRunService, type SkillRunRepository, type SkillRunView, type SkillStepView } from "../src/modules/agent/agent-skill-run.service.js";
import { initializeSkillRun } from "../src/modules/agent/skill-run-initializer.js";

function run(status: SkillRunView["status"] = "waiting_for_approval"): SkillRunView {
  return { approvalState: "pending", budgetSnapshot: {}, error: null, flowId: "flow-1", graphRevision: 2, id: "run-1", idempotencyKey: "key-1", output: {}, projectId: "project-1", skillVersionId: "version-1", status, steps: [], turnId: "turn-1" };
}

describe("SkillRunService", () => {
  it("does not create a database pool until a skill run operation is used", () => {
    expect(() => new SkillRunService()).not.toThrow();
  });

  it("makes approval idempotent and rejects stale approval", async () => {
    let current = run();
    const repository: SkillRunRepository = {
      approveRun: async () => { if (current.approvalState === "approved") return current; if (current.status !== "waiting_for_approval") throw new Error("SKILL_RUN_STALE_APPROVAL"); current = { ...current, approvalState: "approved", status: "running" }; return current; },
      cancelRun: async () => current,
      createRun: async () => ({ created: false, id: current.id }),
      createStep: async () => ({ action: "text", approvalState: "not_required", assetId: null, error: null, id: "step-1", nodeId: null, output: {}, retryCount: 0, status: "pending", stepIndex: 0, workflowRunId: null }),
      getRun: async () => current,
      listEvents: async () => [],
      transitionRun: async () => current,
      updateStep: async () => { throw new Error("not used"); },
    };
    const service = new SkillRunService(repository);
    expect((await service.approve({ tenantId: "tenant-1", userId: "user-1" }, "run-1")).status).toBe("running");
    expect((await service.approve({ tenantId: "tenant-1", userId: "user-1" }, "run-1")).approvalState).toBe("approved");
    current = { ...current, status: "succeeded" };
    await expect(service.approve({ tenantId: "tenant-1", userId: "user-1" }, "run-1")).resolves.toMatchObject({ status: "succeeded", approvalState: "approved" });
    current = { ...current, approvalState: "pending", status: "succeeded" };
    await expect(service.approve({ tenantId: "tenant-1", userId: "user-1" }, "run-1")).rejects.toThrow("SKILL_RUN_STALE_APPROVAL");
  });

  it("cancels partial successes idempotently and rejects a pending approval", async () => {
    let current = run("waiting_for_approval");
    const repository: SkillRunRepository = {
      approveRun: async () => current,
      cancelRun: async (_context, _runId, reason) => {
        current = { ...current, approvalState: "rejected", status: "cancelled", error: { code: "SKILL_RUN_CANCELLED", reason } };
        return current;
      },
      createRun: async () => ({ created: false, id: current.id }),
      createStep: async () => ({ action: "text", approvalState: "not_required", assetId: null, error: null, id: "step-1", nodeId: null, output: {}, retryCount: 0, status: "pending", stepIndex: 0, workflowRunId: null }),
      getRun: async () => current,
      listEvents: async () => [],
      transitionRun: async () => current,
      updateStep: async (_ctx, _id, patch) => ({ action: "text", approvalState: "not_required", assetId: null, error: null, id: "step-1", nodeId: null, output: {}, retryCount: 0, status: patch.status ?? "pending", stepIndex: 0, workflowRunId: null }),
    };
    const service = new SkillRunService(repository);
    await expect(service.cancel({ tenantId: "tenant-1", userId: "user-1" }, "run-1", "user stopped")).resolves.toMatchObject({ status: "cancelled", approvalState: "rejected" });
    await expect(service.cancel({ tenantId: "tenant-1", userId: "user-1" }, "run-1")).resolves.toMatchObject({ status: "cancelled", approvalState: "rejected" });
    current = { ...current, status: "partial_success" };
    await expect(service.cancel({ tenantId: "tenant-1", userId: "user-1" }, "run-1")).rejects.toThrow("SKILL_RUN_ALREADY_TERMINAL");
  });

  it("creates durable steps before execution and preserves retry metadata", async () => {
    let captured: Record<string, unknown> | null = null;
    const step: SkillStepView = { action: "image", approvalState: "pending", assetId: null, error: null, id: "step-1", nodeId: null, output: {}, retryCount: 0, status: "pending", stepIndex: 0, workflowRunId: null };
    const repository: SkillRunRepository = {
      approveRun: async () => run("running"), cancelRun: async () => run("cancelled"), createRun: async () => ({ created: true, id: "run-1" }),
      createStep: async (input) => { captured = input; return step; }, getRun: async () => run(), transitionRun: async () => run(), updateStep: async (_ctx, _id, patch) => ({ ...step, ...patch }),
      listEvents: async () => [],
    };
    const result = await new SkillRunService(repository).createStep({ tenantId: "tenant-1", skillRunId: "run-1", stepIndex: 0, action: "image", approvalState: "pending" });
    expect(captured).toMatchObject({ skillRunId: "run-1", action: "image" });
    expect(result.status).toBe("pending");
  });

  it("replaces the durable budget snapshot for an approval plan", async () => {
    let captured: Record<string, unknown> | undefined;
    const repository: SkillRunRepository = {
      approveRun: async () => run("running"), cancelRun: async () => run("cancelled"), createRun: async () => ({ created: true, id: "run-1" }),
      createStep: async () => ({ action: "image", approvalState: "pending", assetId: null, error: null, id: "step-1", nodeId: null, output: {}, retryCount: 0, status: "pending", stepIndex: 0, workflowRunId: null }),
      getRun: async () => run(), listEvents: async () => [], transitionRun: async () => run(), updateStep: async () => { throw new Error("not used"); },
      replaceBudgetSnapshot: async (_ctx, _runId, snapshot) => { captured = snapshot; return run(); },
    };
    await new SkillRunService(repository).replaceBudgetSnapshot({ tenantId: "tenant-1", userId: "user-1" }, "run-1", { approvalPlan: { flowId: "flow-1" } });
    expect(captured).toEqual({ approvalPlan: { flowId: "flow-1" } });
  });

  it("does not replay the draft transition when a duplicate idempotency request returns an existing run", async () => {
    const transition = vi.fn(async () => run("planned"));
    const getRun = vi.fn(async () => run("planned"));
    const runs = { getRun, transition } as unknown as Pick<SkillRunService, "getRun" | "transition">;
    await expect(initializeSkillRun(runs, { tenantId: "tenant-1", userId: "user-1" }, "run-1", false, false)).resolves.toMatchObject({ status: "planned" });
    expect(transition).not.toHaveBeenCalled();
    expect(getRun).toHaveBeenCalledWith({ tenantId: "tenant-1", userId: "user-1" }, "run-1");
  });
});
