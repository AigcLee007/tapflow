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

  it("preserves server-validated positions and typed node payloads for canvas additions", async () => {
    const executed: V2AgentToolExecution[] = [];
    const loop = new V2AgentTurnLoop({
      textRuntime: { async *streamText(request) {
        if (request.messages.length > 2) { yield { type: "text_delta", text: "done" }; yield { type: "done", finishReason: "stop" }; return; }
        yield { type: "tool_call", callId: "call-position", name: "canvas.apply_ops", arguments: JSON.stringify({ expectedRevision: 2, ops: [{ type: "add_text", text: "hello", position: { x: 120, y: 80 } }] }) };
      } },
      executeTool: async (tool) => { executed.push(tool); return {}; },
    });
    for await (const _event of loop.run({ prompt: "x", canvas: { revision: 2, nodes: [] } })) { /* consume */ }
    expect(executed[0]?.arguments.ops).toEqual([{ type: "add_text", text: "hello", position: { x: 120, y: 80 } }]);
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

  it("ends the stream as waiting when a workflow result is not terminal", async () => {
    const events: unknown[] = [];
    const loop = new V2AgentTurnLoop({
      textRuntime: { async *streamText() { yield { type: "tool_call", callId: "call-wait", name: "canvas.await_results", arguments: JSON.stringify({ runId: "11111111-1111-4111-8111-111111111111" }) }; } },
      executeTool: async () => ({ allTerminal: false, status: "waiting" }),
    });
    for await (const event of loop.run({ prompt: "wait", canvas: { revision: 1, nodes: [] } })) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: "turn_waiting" });
  });

  it("ends the stream as waiting when a Skill launch needs approval", async () => {
    const events: unknown[] = [];
    const loop = new V2AgentTurnLoop({
      textRuntime: { async *streamText() { yield { type: "tool_call", callId: "call-approval", name: "canvas.run_nodes", arguments: JSON.stringify({ expectedRevision: 1, nodeIds: ["node-1"] }) }; } },
      executeTool: async () => ({ approvalId: "skill-run-1", nodeCount: 1, status: "waiting_for_approval" }),
    });
    for await (const event of loop.run({ prompt: "run it", canvas: { revision: 1, nodes: [] } })) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: "turn_waiting", reason: "approval" });
  });

  it("ends the stream as waiting for user input after ask_user", async () => {
    const events: unknown[] = [];
    const loop = new V2AgentTurnLoop({
      textRuntime: { async *streamText() { yield { type: "tool_call", callId: "call-question", name: "ask_user", arguments: JSON.stringify({ question: "目标受众是谁？", reason: "需要确定文案长度", options: [{ id: "kids", label: "儿童", description: "适合低龄用户" }] }) }; } },
      executeTool: async () => ({ status: "waiting_for_input", question: "目标受众是谁？", options: [{ id: "kids", label: "儿童", description: "适合低龄用户" }] }),
    });

    for await (const event of loop.run({ prompt: "写一段介绍", canvas: { revision: 1, nodes: [] } })) events.push(event);

    expect(events.at(-1)).toMatchObject({
      type: "turn_waiting",
      reason: "user_input",
      details: { question: "目标受众是谁？", reason: "需要确定文案长度", options: [{ id: "kids", label: "儿童", description: "适合低龄用户" }] },
    });
  });

  it("passes only the scoped and redacted Skill context to the model", async () => {
    let systemPrompt = "";
    const loop = new V2AgentTurnLoop({
      textRuntime: {
        async *streamText(request) {
          systemPrompt = request.messages[0]?.content ?? "";
          yield { type: "text_delta", text: "done" };
          yield { type: "done", finishReason: "stop" };
        },
      },
      executeTool: async () => ({}),
    });

    for await (const _event of loop.run({
      canvas: { revision: 1, nodes: [], selectedNodeIds: [], viewport: { x: 0, y: 0, zoom: 1 } },
      prompt: "create copy",
      skill: {
        id: "skill-1",
        version: 1,
        source: { method: "use apiKey=secret at https://private.example" },
        normalized: {},
      },
    })) {
      // consume
    }

    expect(systemPrompt).toContain("untrusted");
    expect(systemPrompt).not.toMatch(/private\.example|apiKey=secret/i);
  });

  it("redacts tool output before yielding it and continuing the model loop", async () => {
    const requests: Array<{ messages: Array<{ content: string }> }> = [];
    let call = 0;
    const loop = new V2AgentTurnLoop({
      textRuntime: {
        async *streamText(request) {
          requests.push({ messages: request.messages });
          call += 1;
          if (call === 1) {
            yield { type: "tool_call", callId: "call-safe", name: "canvas.get_context", arguments: "{}" };
            yield { type: "done", finishReason: "tool_calls" };
          } else {
            yield { type: "text_delta", text: "done" };
            yield { type: "done", finishReason: "stop" };
          }
        },
      },
      executeTool: async () => ({ status: "ok", provider: "internal", apiKey: "secret", message: "safe" }),
    });

    for await (const event of loop.run({ canvas: { revision: 1, nodes: [] }, prompt: "x" })) {
      if (event.type === "tool_result") expect(JSON.stringify(event.result)).not.toMatch(/provider|apiKey|secret/i);
    }
    expect(requests[1]?.messages.at(-1)?.content).not.toMatch(/provider|apiKey|secret/i);
    expect(requests[1]?.messages.at(-1)?.content).toContain("safe");
  });
});
