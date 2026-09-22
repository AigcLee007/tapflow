import { describe, expect, it, vi } from "vitest";
import { WorkflowNodeExecutionService } from "../src/workflow-runtime/service.js";

describe("Agent result placement boundary", () => {
  it("does not even lock or mutate the draft when an Agent output node ID collides with the canvas", async () => {
    const query = vi.fn().mockRejectedValue(new Error("Agent must not touch draft"));
    const buildDraftOutputPatch = vi.fn().mockReturnValue({ text: "result" });
    const patch = (WorkflowNodeExecutionService.prototype as unknown as { patchTargetNodeOutputIntoDraft: (...args: unknown[]) => Promise<void> }).patchTargetNodeOutputIntoDraft;
    await patch.call({ buildDraftOutputPatch, isLatestTargetNodeRun: async () => true }, { query }, { id: "collision", type: "text.generate" }, { flow_id: "flow" }, { input_json: { agentExecution: { graphChecksum: "checksum", graphRevision: 4 } } }, { id: "node-run" }, { text: "result" });
    expect(query).not.toHaveBeenCalled();
    expect(buildDraftOutputPatch).not.toHaveBeenCalled();
  });
});
