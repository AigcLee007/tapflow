import { describe, expect, it } from "vitest";

import { createAgentToolEventParser } from "./canvasAgentToolEvents";

describe("canvasAgentToolEvents", () => {
  it("parses chunked executor SSE events", () => {
    const parser = createAgentToolEventParser();

    expect(parser.push('event: message_delta\ndata: {"content":"hel')).toEqual([]);
    expect(parser.push('lo"}\n\n')).toEqual([
      { content: "hello", type: "message_delta" },
    ]);
    expect(parser.push('event: tool_started\ndata: {"toolCallKey":"tool-1","toolName":"generate_image"}\n\n')).toEqual([
      { toolCallKey: "tool-1", toolName: "generate_image", type: "tool_started" },
    ]);
    expect(parser.push('event: approval_required\ndata: {"estimate":{"totalCredits":4},"toolCallKey":"tool-1","turnId":"turn-1"}\n\n')).toEqual([
      { estimate: { totalCredits: 4 }, toolCallKey: "tool-1", turnId: "turn-1", type: "approval_required" },
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
