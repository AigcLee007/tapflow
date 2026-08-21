import { describe, expect, it } from "vitest";

import { buildDraftOutputPatchForNode } from "../src/workflow-runtime/service.js";

describe("Agent Skill text result write-back", () => {
  it("maps a successful text node output to editable canvas data", () => {
    expect(buildDraftOutputPatchForNode(
      { id: "text-1", type: "text.generate" },
      { id: "node-run-1" },
      { id: "workflow-1", flow_id: "flow-1", tenant_id: "tenant-1" },
      { text: "生成后的文案" },
    )).toMatchObject({
      text: "生成后的文案",
      generationStatus: "done",
      latestNodeRunId: "node-run-1",
      latestWorkflowRunId: "workflow-1",
      status: "success",
    });
  });
});
