import Fastify from "fastify";
import { describe, expect, test } from "vitest";

import { registerCanvasAgentRoutes } from "../src/modules/canvas-agent/canvas-agent.routes.js";
import { CanvasAgentLoop } from "../src/modules/canvas-agent/canvas-agent.loop.js";
import { CanvasAgentService } from "../src/modules/canvas-agent/canvas-agent.service.js";
import { infoTools } from "../src/modules/canvas-agent/canvas-agent.tools.js";
import { interactiveTools } from "../src/modules/canvas-agent/canvas-agent.interactive-tools.js";
import { MemoryCanvasAgentRepository, calls, fakeDeps, say, scriptedRuntime } from "./fixtures/canvas-agent-fakes.js";

const id = "11111111-1111-4111-8111-111111111111";
const agentCtx = { permissions: ["flow:read", "flow:update"], tenantId: id, userId: id };

async function appFor(options: { enabled?: boolean; permissions?: string[]; rounds?: Parameters<typeof scriptedRuntime>[0] } = {}) {
  const repository = new MemoryCanvasAgentRepository();
  const deps = fakeDeps(repository);
  const runtime = scriptedRuntime(options.rounds ?? []);
  const service = new CanvasAgentService({
    defaultRouteKey: "text.agent", deps, textRuntime: runtime,
    loop: new CanvasAgentLoop({ deps, textRuntime: runtime, tools: [...infoTools, ...interactiveTools] }),
  });
  const app = Fastify({ logger: false });
  app.addHook("onRequest", async (request) => {
    request.ctx = {
      ipHash: null, isAuthenticated: true, permissions: options.permissions ?? agentCtx.permissions, requestId: "test",
      roles: [], sessionId: id, tenantId: id, traceId: "test", userAgent: null, userId: id,
    } as never;
  });
  app.decorate("canvasAgentService", service);
  registerCanvasAgentRoutes(app, { enabled: options.enabled ?? true });
  const flowId = repository.addFlow(agentCtx);
  return { app, flowId, repository };
}

/** Parse an SSE body into its JSON events. */
const sseEvents = (body: string) => body.split("\n\n").filter((frame) => frame.startsWith("event:"))
  .map((frame) => JSON.parse(frame.split("\n").find((line) => line.startsWith("data:"))!.slice(5)));

describe("canvas agent routes", () => {
  test("returns 503 while CANVAS_AGENT_ENABLED is off", async () => {
    const { app, flowId } = await appFor({ enabled: false });
    try {
      const response = await app.inject({ method: "POST", payload: { flowId }, url: "/api/v2/canvas-agent/sessions" });
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("CANVAS_AGENT_DISABLED");
    } finally { await app.close(); }
  });

  test("requires flow:update to write", async () => {
    const { app, flowId } = await appFor({ permissions: ["flow:read"] });
    try {
      expect((await app.inject({ method: "POST", payload: { flowId }, url: "/api/v2/canvas-agent/sessions" })).statusCode).toBe(403);
    } finally { await app.close(); }
  });

  test("streams a full message turn as server-sent events", async () => {
    const { app, flowId } = await appFor({ rounds: [calls(["canvas_inspect", {}]), say("画布是空的，我们从零开始。")] });
    try {
      const created = await app.inject({ method: "POST", payload: { flowId }, url: "/api/v2/canvas-agent/sessions" });
      expect(created.statusCode).toBe(201);
      const sessionId = created.json().id;

      const response = await app.inject({
        method: "POST", url: `/api/v2/canvas-agent/sessions/${sessionId}/messages`,
        payload: { canvas: { nodes: [], revision: 0, selectedNodeIds: [] }, content: "做一套详情页" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/event-stream");
      const events = sseEvents(response.body);
      expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["status", "tool_started", "tool_finished", "text_delta"]));
      expect(events.at(-1)).toEqual({ reason: "completed", type: "done" });

      const detail = (await app.inject({ method: "GET", url: `/api/v2/canvas-agent/sessions/${sessionId}` })).json();
      expect(detail.session).toMatchObject({ status: "idle", title: "做一套详情页" });
      // Raw tool output is not exposed to the browser.
      expect(detail.messages.find((m: { role: string }) => m.role === "tool")).toMatchObject({ content: "", display: { title: "查看当前画布节点与素材" } });
    } finally { await app.close(); }
  });

  test("rejects bad input and busy sessions as plain HTTP errors, before any stream opens", async () => {
    const { app, flowId, repository } = await appFor({ rounds: [say("ok")] });
    try {
      const sessionId = (await app.inject({ method: "POST", payload: { flowId }, url: "/api/v2/canvas-agent/sessions" })).json().id;
      const invalid = await app.inject({ method: "POST", payload: { content: 42 }, url: `/api/v2/canvas-agent/sessions/${sessionId}/messages` });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().error.code).toBe("VALIDATION_ERROR");

      await repository.updateSession(agentCtx, sessionId, { status: "running" });
      const busy = await app.inject({ method: "POST", payload: { content: "你好" }, url: `/api/v2/canvas-agent/sessions/${sessionId}/messages` });
      expect(busy.statusCode).toBe(409);
      expect(busy.headers["content-type"]).toContain("application/json");
      expect(busy.json().error.code).toBe("CANVAS_AGENT_BUSY");
    } finally { await app.close(); }
  });

  test("hides other users' flows", async () => {
    const { app } = await appFor();
    try {
      const response = await app.inject({ method: "GET", url: `/api/v2/canvas-agent/sessions?flowId=${id}` });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("CANVAS_AGENT_FLOW_NOT_FOUND");
    } finally { await app.close(); }
  });
});
