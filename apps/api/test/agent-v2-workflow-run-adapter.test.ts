import { describe, expect, it } from "vitest";

import { V2WorkflowRunAdapter } from "../src/modules/agent/v2/v2-workflow-run-adapter.js";

describe("V2WorkflowRunAdapter", () => {
  it("creates target-node workflow runs with Skill metadata and stable idempotency", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const adapter = new V2WorkflowRunAdapter({
      getFlowRevision: async () => 7,
      workflowRuns: {
        createWorkflowRun: async (_context, flowId, input) => {
          calls.push({ flowId, ...input });
          return { runId: `run-${calls.length}`, status: "queued" };
        },
      },
    });
    const result = await adapter.runNodes({ tenantId: "tenant-1", userId: "user-1" }, {
      flowId: "flow-1",
      graphRevision: 7,
      idempotencyKey: "turn-1",
      nodeIds: ["node-1", "node-2"],
      skillRunId: "skill-run-1",
      skillVersionId: "skill-version-1",
    });
    expect(result).toEqual({ revision: 7, runs: [{ nodeId: "node-1", runId: "run-1", status: "queued" }, { nodeId: "node-2", runId: "run-2", status: "queued" }] });
    expect(calls[0]).toMatchObject({ flowId: "flow-1", idempotencyKey: "v2:turn-1:node-1", input: { runMode: "target_node", targetNodeId: "node-1", agentSkillRunId: "skill-run-1", agentSkillVersionId: "skill-version-1" } });
  });

  it("rejects a stale graph revision before enqueuing anything", async () => {
    let called = false;
    const adapter = new V2WorkflowRunAdapter({ getFlowRevision: async () => 8, workflowRuns: { createWorkflowRun: async () => { called = true; return { runId: "run", status: "queued" }; } } });
    await expect(adapter.runNodes({ tenantId: "tenant-1", userId: "user-1" }, { flowId: "flow-1", graphRevision: 7, idempotencyKey: "turn-1", nodeIds: ["node-1"] })).rejects.toThrow("FLOW_DRAFT_REVISION_CONFLICT");
    expect(called).toBe(false);
  });

  it("returns structured statuses for canvas await results", async () => {
    const adapter = new V2WorkflowRunAdapter({
      getFlowRevision: async () => 7,
      workflowRuns: {
        createWorkflowRun: async () => ({ runId: "run", status: "queued" }),
        getWorkflowRunStatus: async (_context, runId) => ({
          canceledAt: null,
          finishedAt: runId === "run-done" ? "2026-08-20T00:00:00.000Z" : null,
          id: runId,
          status: runId === "run-done" ? "succeeded" : "running",
          tenantId: "tenant-1",
        }),
      },
    });
    await expect(adapter.awaitResults({ tenantId: "tenant-1", userId: "user-1" }, ["run-done", "run-live"]))
      .resolves.toEqual({ allTerminal: false, runs: [
        expect.objectContaining({ id: "run-done", status: "succeeded" }),
        expect.objectContaining({ id: "run-live", status: "running" }),
      ] });
  });

  it("passes only Skill identifiers into workflow input, never provider configuration", async () => {
    let createdInput: Record<string, unknown> | null = null;
    const adapter = new V2WorkflowRunAdapter({
      getFlowRevision: async () => 1,
      workflowRuns: {
        createWorkflowRun: async (_context, _flowId, input) => {
          createdInput = input.input ?? null;
          return { runId: "run-1", status: "queued" };
        },
      },
    });
    await adapter.runNodes({ tenantId: "tenant-1", userId: "user-1" }, {
      flowId: "flow-1",
      graphRevision: 1,
      idempotencyKey: "turn-1",
      nodeIds: ["node-1"],
      skillRunId: "skill-run-1",
      skillStepIds: { "node-1": "skill-step-1" },
      skillVersionId: "skill-version-1",
      ...( { apiKey: "secret", baseUrl: "https://provider.invalid" } as never),
    });
    expect(createdInput).toEqual({
      agentSkillRunId: "skill-run-1",
      agentSkillStepId: "skill-step-1",
      agentSkillVersionId: "skill-version-1",
      runMode: "target_node",
      targetNodeId: "node-1",
    });
    expect(JSON.stringify(createdInput)).not.toContain("secret");
  });
});
