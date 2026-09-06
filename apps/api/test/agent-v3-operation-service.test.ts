import { describe, expect, it, vi } from "vitest";

import { CanvasOperationService } from "../src/modules/agent/v3/canvas-operation-service.js";

const operationSet = {
  operationSetId: "set-1", taskId: "task-1", turnId: "turn-1", baseRevision: 2,
  summary: "Create and connect", risk: "safe" as const, requiresApproval: false,
  preconditions: [], expectedEffects: [],
  operations: [
    { type: "node.create" as const, node: { id: "new", type: "text", position: { x: 1, y: 2 }, data: {} } },
    { type: "edge.connect" as const, edge: { id: "edge-1", source: "existing", target: "new" } },
  ],
};

describe("CanvasOperationService", () => {
  it("applies a revisioned set once and returns inverse operations", async () => {
    const saveFlowDraft = vi.fn().mockResolvedValue({ revision: 3 });
    const service = new CanvasOperationService({
      getFlowDraft: vi.fn().mockResolvedValue({ revision: 2, graph: { nodes: [{ id: "existing", type: "text", position: { x: 0, y: 0 }, data: {} }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } } }),
      saveFlowDraft,
    });

    const first = await service.applyApprovedOperationSet({ tenantId: "tenant", projectId: "project", flowId: "flow", taskId: "task-1", operationSet });
    const repeat = await service.applyApprovedOperationSet({ tenantId: "tenant", projectId: "project", flowId: "flow", taskId: "task-1", operationSet });

    expect(first.revision).toBe(3);
    expect(first.createdNodeIds).toEqual(["new"]);
    expect(first.inverseOperations).toEqual(expect.arrayContaining([{ type: "edge.delete", edgeId: "edge-1" }, { type: "node.delete", nodeId: "new" }]));
    expect(repeat).toEqual(first);
    expect(saveFlowDraft).toHaveBeenCalledTimes(1);
  });

  it("does not save an operation set against a stale draft", async () => {
    const saveFlowDraft = vi.fn();
    const service = new CanvasOperationService({ getFlowDraft: vi.fn().mockResolvedValue({ revision: 3, graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } } }), saveFlowDraft });
    await expect(service.applyApprovedOperationSet({ tenantId: "tenant", projectId: "project", flowId: "flow", taskId: "task-1", operationSet })).rejects.toMatchObject({ statusCode: 409, code: "FLOW_DRAFT_REVISION_CONFLICT" });
    expect(saveFlowDraft).not.toHaveBeenCalled();
  });
});
