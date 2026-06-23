import { describe, expect, it } from "vitest";

import { approveAgentToolCallStream, executeAgentTurnStream, readAgentSseStream } from "./canvasAgentApi";

function createStreamResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    status: 200,
  });
}

describe("canvasAgentApi", () => {
  it("opens the executor stream endpoint", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    try {
      await executeAgentTurnStream("session-1", {
        prompt: "make image",
        snapshot: {
          edges: [],
          flowId: null,
          nodeOutputs: {},
          nodes: [],
          projectId: null,
          selectedNodeIds: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(String(calls[0]?.input)).toBe("/api/v2/agent/sessions/session-1/turns/execute/stream");
    expect(calls[0]?.init?.method).toBe("POST");
  });

  it("opens the tool approval stream endpoint", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    try {
      await approveAgentToolCallStream("session-1", {
        toolCallKey: "tool-1",
        turnId: "00000000-0000-0000-0000-000000000001",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(String(calls[0]?.input)).toBe("/api/v2/agent/sessions/session-1/tool-calls/approve/stream");
    expect(calls[0]?.init?.method).toBe("POST");
  });

  it("parses plan and done events from agent SSE", async () => {
    const plans: unknown[] = [];
    const done: unknown[] = [];
    await readAgentSseStream(
      createStreamResponse([
        'event: plan\ndata: {"reply":"server plan","approvalRequired":true,"evidence":[],"plan":[],"proposedOps":[]}\n\n',
        'event: done\ndata: {"turnId":"turn-1"}\n\n',
      ]),
      {
        onDone: (data) => done.push(data),
        onPlan: (data) => plans.push(data),
      },
    );

    expect(plans).toHaveLength(1);
    expect(done).toEqual([{ turnId: "turn-1" }]);
  });
});
