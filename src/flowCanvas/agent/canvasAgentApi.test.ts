import { describe, expect, it } from "vitest";

import { buildAgentReferenceContext } from "./agentReferenceContext";
import {
  approveAgentToolCallStream,
  createAgentTurn,
  executeAgentTurnStream,
  listAgentSkills,
  openAgentV2TurnStream,
  readAgentSseStream,
} from "./canvasAgentApi";

const emptySnapshot = {
  edges: [],
  flowId: null,
  nodeOutputs: {},
  nodes: [],
  projectId: null,
  selectedNodeIds: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

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
  it("sends reference context when creating an agent turn", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return Response.json({ sessionId: "session-1", turnId: "turn-1" });
    }) as typeof fetch;

    try {
      await createAgentTurn("session-1", {
        prompt: "use the reference",
        referenceContext: {
          items: [
            {
              assetId: "asset-1",
              kind: "upload",
              label: "参考图",
              refId: "ref-1",
            },
          ],
        },
        snapshot: emptySnapshot,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(String(calls[0]?.input)).toBe("/api/v2/agent/sessions/session-1/turns");
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      referenceContext: {
        items: [
          {
            assetId: "asset-1",
            kind: "upload",
            label: "参考图",
            refId: "ref-1",
          },
        ],
      },
    });
  });

  it("sends reference context when executing an agent turn stream", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    try {
      await executeAgentTurnStream("session-1", {
        prompt: "make image",
        referenceContext: {
          items: [
            {
              assetId: "asset-1",
              kind: "canvas_node",
              label: "参考图",
              nodeId: "node-1",
              refId: "ref-1",
            },
          ],
        },
        snapshot: emptySnapshot,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(String(calls[0]?.input)).toBe("/api/v2/agent/sessions/session-1/turns/execute/stream");
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      referenceContext: {
        items: [
          {
            assetId: "asset-1",
            kind: "canvas_node",
            label: "参考图",
            nodeId: "node-1",
            refId: "ref-1",
          },
        ],
      },
    });
  });

  it("serializes reference context without preview URLs or inline asset URLs", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    try {
      await executeAgentTurnStream("session-1", {
        prompt: "make image",
        referenceContext: buildAgentReferenceContext({
          chips: [
            {
              assetId: "asset-1",
              id: "chip-1",
              kind: "upload",
              label: "参考图",
              previewUrl: "blob:http://localhost/preview",
              refId: "ref-1",
            },
            {
              assetId: "asset-2",
              id: "chip-2",
              kind: "artifact",
              label: "参考图 2",
              previewUrl: "data:image/png;base64,abc",
              refId: "ref-2",
            },
          ],
        }),
        snapshot: emptySnapshot,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const serializedBody = String(calls[0]?.init?.body);
    expect(serializedBody).toContain('"referenceContext"');
    expect(serializedBody).not.toContain("previewUrl");
    expect(serializedBody).not.toContain("blob:");
    expect(serializedBody).not.toContain("data:");
  });

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
        snapshot: emptySnapshot,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(String(calls[0]?.input)).toBe("/api/v2/agent/sessions/session-1/turns/execute/stream");
    expect(calls[0]?.init?.method).toBe("POST");
  });

  it("lists skills and opens the flag-gated v2 stream", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    try {
      await listAgentSkills({ scope: "available", modality: "text" });
      await openAgentV2TurnStream("session-1", { prompt: "hello", snapshot: { ...emptySnapshot, flowId: "flow-1" }, idempotencyKey: "turn-1" });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(String(calls[0]?.input)).toBe("/api/v2/agent/skills?scope=available&modality=text");
    expect(String(calls[1]?.input)).toBe("/api/v2/agent/sessions/session-1/v2-turns/stream");
    expect(JSON.parse(String(calls[1]?.init?.body))).toMatchObject({ idempotencyKey: "turn-1" });
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
