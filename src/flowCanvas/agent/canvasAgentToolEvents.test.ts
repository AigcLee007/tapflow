import { describe, expect, it } from "vitest";

import { createAgentToolEventParser } from "./canvasAgentToolEvents";

describe("canvasAgentToolEvents", () => {
  it("parses chunked executor SSE events", () => {
    const parser = createAgentToolEventParser();

    expect(parser.push('event: thinking_status\ndata: {"label":"理解需求","detail":"Analyzing canvas context"}\n\n')).toEqual([
      { detail: "Analyzing canvas context", label: "理解需求", type: "thinking_status" },
    ]);
    expect(parser.push('event: message_delta\ndata: {"content":"hel')).toEqual([]);
    expect(parser.push('lo"}\n\n')).toEqual([
      { content: "hello", type: "message_delta" },
    ]);
    expect(parser.push('event: tool_started\ndata: {"toolCallKey":"tool-1","toolName":"generate_image"}\n\n')).toEqual([
      { toolCallKey: "tool-1", toolName: "generate_image", type: "tool_started" },
    ]);
    expect(parser.push('event: task_created\ndata: {"taskId":"tool-db-1","title":"Image generation","toolCallKey":"tool-1","toolName":"generate_image"}\n\n')).toEqual([
      { taskId: "tool-db-1", title: "Image generation", toolCallKey: "tool-1", toolName: "generate_image", type: "task_created" },
    ]);
    expect(parser.push('event: task_completed\ndata: {"taskId":"tool-db-1","toolCallKey":"tool-1","result":{"workflowRunId":"run-1"}}\n\n')).toEqual([
      { result: { workflowRunId: "run-1" }, taskId: "tool-db-1", toolCallKey: "tool-1", type: "task_completed" },
    ]);
    expect(parser.push('event: task_failed\ndata: {"taskId":"tool-db-2","toolCallKey":"tool-2","code":"WORKFLOW_FAILED","message":"Workflow failed."}\n\n')).toEqual([
      { code: "WORKFLOW_FAILED", message: "Workflow failed.", taskId: "tool-db-2", toolCallKey: "tool-2", type: "task_failed" },
    ]);
    expect(parser.push('event: workflow_run_linked\ndata: {"toolCallKey":"tool-1","workflowRunId":"run-1","nodeRunId":"node-1"}\n\n')).toEqual([
      { nodeRunId: "node-1", toolCallKey: "tool-1", type: "workflow_run_linked", workflowRunId: "run-1" },
    ]);
    expect(parser.push('event: artifact_created\ndata: {"assetRef":{"assetId":"asset-1","kind":"image","label":"Round 1 image 1","promptSummary":"","refId":"round-1-image-1"},"taskId":"tool-db-1","toolCallKey":"tool-1"}\n\n')).toEqual([
      {
        assetRef: { assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" },
        taskId: "tool-db-1",
        toolCallKey: "tool-1",
        type: "artifact_created",
      },
    ]);
    expect(parser.push('event: approval_required\ndata: {"estimate":{"totalCredits":4},"toolCallKey":"tool-1","turnId":"turn-1"}\n\n')).toEqual([
      { estimate: { totalCredits: 4 }, toolCallKey: "tool-1", turnId: "turn-1", type: "approval_required" },
    ]);
    expect(parser.push('event: approval_required\ndata: {"estimate":{"totalCredits":5,"referenceRefs":["round-1-image-1","asset:2"]},"toolCallKey":"tool-edit-1","turnId":"turn-2"}\n\n')).toEqual([
      {
        estimate: { referenceRefs: ["round-1-image-1", "asset:2"], totalCredits: 5 },
        toolCallKey: "tool-edit-1",
        turnId: "turn-2",
        type: "approval_required",
      },
    ]);
  });

  it("returns a safe turn_failed event for malformed JSON", () => {
    const parser = createAgentToolEventParser();

    expect(parser.push("event: tool_result\ndata: {bad}\n\n")).toEqual([
      expect.objectContaining({
        code: "AGENT_EVENT_PARSE_FAILED",
        type: "turn_failed",
      }),
    ]);
  });
});
