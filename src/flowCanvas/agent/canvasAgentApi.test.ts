import { describe, expect, it } from "vitest";

import { buildAgentReferenceContext } from "./agentReferenceContext";
import {
  approveAgentToolCallStream,
  approveAgentSkillRun,
  createAgentTurn,
  executeAgentTurnStream,
  getAgentSkillRun,
  listAgentSkills,
  openAgentV2TurnStream,
  placeSkillRunResults,
  readAgentSseStream,
  cancelAgentSkillRun,
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

  it("projects Skill picker responses to product-safe fields", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => Response.json([{
      baseUrl: "https://provider.internal",
      category: "marketing",
      credential: "secret",
      id: "skill-1",
      inputHints: [
        { key: "prompt", kind: "text", label: "提示词", required: true, routeKey: "internal-route" },
        { kind: "unknown", label: 42, required: "yes" },
      ],
      modality: "image",
      name: "封面图",
      normalized: { method: "do not expose" },
      ownerUserId: "internal-owner",
      provider: "internal-provider",
      routeKey: "internal-route",
      status: "published",
      summary: "生成封面",
      version: 3,
      visibility: "official",
    }])) as typeof fetch;

    try {
      const [skill] = await listAgentSkills();
      expect(skill).toEqual({
        category: "marketing",
        id: "skill-1",
        inputHints: [{ kind: "text", label: "提示词", required: true }],
        modality: "image",
        name: "封面图",
        summary: "生成封面",
        version: 3,
        visibility: "official",
      });
      expect(JSON.stringify(skill)).not.toMatch(/routeKey|provider|credential|baseUrl|normalized/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("exposes product-safe Skill Run operations", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      if (String(input).endsWith("/skill-runs/run-1")) {
        return Response.json({
          approvalState: "pending",
          budgetSnapshot: { estimatedCredits: 8, provider: "secret" },
          id: "run-1",
          routeKey: "internal-route",
          status: "waiting_for_approval",
          steps: [{ action: "image", assetId: "asset-1", id: "step-1", nodeId: "node-1", output: { baseUrl: "secret" }, status: "waiting_for_approval", stepIndex: 0 }],
        });
      }
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    try {
      const run = await getAgentSkillRun("run-1");
      await approveAgentSkillRun("session-1", "run-1");
      await cancelAgentSkillRun("session-1", "run-1", "user cancelled");
      expect(calls.map((call) => String(call.input))).toEqual([
        "/api/v2/agent/skill-runs/run-1",
        "/api/v2/agent/sessions/session-1/approvals/run-1/stream",
        "/api/v2/agent/skill-runs/run-1/cancel",
      ]);
      expect(run).toMatchObject({
        approvalState: "pending",
        estimatedCredits: 8,
        id: "run-1",
        status: "waiting_for_approval",
        steps: [{ assetId: "asset-1", id: "step-1", nodeId: "node-1", status: "waiting_for_approval" }],
      });
      expect(JSON.stringify(run)).not.toMatch(/routeKey|provider|baseUrl/);
      expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({ reason: "user cancelled" });
    } finally {
      globalThis.fetch = originalFetch;
    }
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

  it("places a completed Skill run result through the V2 endpoint", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return Response.json({ applied: { createdNodeIds: ["node-1"] } });
    }) as typeof fetch;
    try {
      await placeSkillRunResults("run-1", {
        expectedRevision: 4,
        flowId: "flow-1",
        results: [{ kind: "text", text: "result" }],
        sessionId: "session-1",
        turnId: "turn-1",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(String(calls[0]?.input)).toBe("/api/v2/agent/skill-runs/run-1/place-results");
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({ expectedRevision: 4, flowId: "flow-1" });
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
