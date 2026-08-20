import { describe, expect, it } from "vitest";

import { V2AgentTurnLoop, type V2AgentToolExecution } from "../src/modules/agent/v2/agent-turn-loop.js";

describe("V2AgentTurnLoop", () => {
  it("streams native tool calls, executes canvas tools, and continues with the result", async () => {
    const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    const executed: V2AgentToolExecution[] = [];
    let call = 0;
    const loop = new V2AgentTurnLoop({
      textRuntime: {
        async *streamText(request) {
          requests.push({ messages: request.messages });
          call += 1;
          if (call === 1) {
            yield { type: "tool_call", callId: "call-1", name: "canvas.apply_ops", arguments: JSON.stringify({ expectedRevision: 3, ops: [{ type: "add_text", text: "hello" }] }) };
            yield { type: "done", finishReason: "tool_calls" };
          } else {
            yield { type: "text_delta", text: "已放到画布。" };
            yield { type: "done", finishReason: "stop" };
          }
        },
      },
      executeTool: async (tool) => { executed.push(tool); return { applied: ["text-1"] }; },
    });

    const events = [];
    for await (const event of loop.run({ prompt: "写一句欢迎语", canvas: { revision: 3, nodes: [] }, routeKey: "text.agent" })) events.push(event);
    expect(executed[0]?.name).toBe("canvas.apply_ops");
    expect(events.some((event) => event.type === "tool_result")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "turn_completed", text: "已放到画布。" });
    expect(requests[1]?.messages.at(-1)?.content).toContain("text-1");
    expect(requests[0]?.messages[0]?.content).toContain("untrusted");
  });

  it("fails closed for an unknown model tool and never executes it", async () => {
    let executed = false;
    const loop = new V2AgentTurnLoop({
      textRuntime: { async *streamText() { yield { type: "tool_call", callId: "call-1", name: "http.request", arguments: "{}" }; } },
      executeTool: async () => { executed = true; return {}; },
    });
    await expect(async () => { for await (const _event of loop.run({ prompt: "x", canvas: { revision: 0, nodes: [] } })) { /* consume */ } }).rejects.toThrow("AGENT_TOOL_NOT_ALLOWED");
    expect(executed).toBe(false);
  });
});
