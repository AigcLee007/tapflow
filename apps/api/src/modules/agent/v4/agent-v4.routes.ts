import type { FastifyInstance } from "fastify";
import { requireAuth, requirePermission, requireTenant } from "../../../http/auth-middleware.js";
import { agentV4RetryItemInputSchema, agentV4TurnInputSchema, agentV4UndoInputSchema } from "./agent-v4-schemas.js";
import { ZodError } from "zod";
import { parseV4AfterSequence, readAgentV4RouteResponse } from "./agent-v4-route-contract.js";

export function sendV4Error(error: unknown, reply: any) {
  const statusCode = error && typeof error === "object" && "statusCode" in error ? Number((error as any).statusCode) : error instanceof ZodError ? 400 : 500;
  return reply.code(statusCode).send({ error: { code: error instanceof ZodError ? "INVALID_REQUEST" : error instanceof Error ? error.message : "INTERNAL_ERROR" } });
}

export function registerAgentV4Routes(app: FastifyInstance): void {
  const read = [requireAuth, requireTenant, requirePermission("flow:read")];
  const run = [requireAuth, requireTenant, requirePermission("flow:run")];
  const startTurn = (stream: boolean) => async (request: any, reply: any) => {
    try { const result = await app.agentV4Runtime.startTurn({ sessionId: String(request.params.sessionId), context: { tenantId: request.ctx.tenantId!, userId: request.ctx.userId }, body: agentV4TurnInputSchema.parse(request.body) });
      if (!stream) return reply.send(readAgentV4RouteResponse(false, result));
      reply.raw.setHeader("cache-control", "no-cache"); reply.raw.setHeader("connection", "keep-alive"); reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8"); reply.hijack();
      reply.raw.write(readAgentV4RouteResponse(true, result)); reply.raw.end(); return reply;
    }
    catch (error) { return sendV4Error(error, reply); }
  };
  app.post("/api/v2/agent/v4/sessions/:sessionId/turns", { preHandler: read }, startTurn(false));
  app.post("/api/v2/agent/v4/sessions/:sessionId/turns/stream", { preHandler: read }, startTurn(true));
  app.get("/api/v2/agent/v4/sessions/:sessionId/latest-task", { preHandler: read }, async (request, reply) => {
    try { return reply.send(await app.agentV4Runtime.latestTask({ sessionId: String((request.params as any).sessionId), context: { tenantId: request.ctx.tenantId!, userId: request.ctx.userId } })); }
    catch (error) { return sendV4Error(error, reply); }
  });
  app.get("/api/v2/agent/v4/tasks/:taskId/events", { preHandler: read }, async (request, reply) => {
    try {
      const params = request.params as { taskId: string }; const query = request.query as { afterSeq?: string | number };
      const events = await app.agentV4Runtime.replayEvents({ tenantId: request.ctx.tenantId!, taskId: params.taskId, afterSeq: parseV4AfterSequence(query.afterSeq) });
      reply.raw.setHeader("cache-control", "no-cache"); reply.raw.setHeader("connection", "keep-alive"); reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8"); reply.hijack();
      for (const event of events) reply.raw.write(`event: event\ndata: ${JSON.stringify({ sequence: event.seq, type: event.eventType, ...event.eventJson })}\n\n`);
      reply.raw.write(`event: done\ndata: ${JSON.stringify({ taskId: params.taskId })}\n\n`); reply.raw.end(); return reply;
    } catch (error) { return sendV4Error(error, reply); }
  });
  app.post("/api/v2/agent/v4/tasks/:taskId/approve", { preHandler: run }, async (request, reply) => { try { return reply.send(await app.agentV4Runtime.approve({ taskId: String((request.params as any).taskId), context: { tenantId: request.ctx.tenantId!, userId: request.ctx.userId }, approved: (request.body as any)?.approved !== false })); } catch (error) { return sendV4Error(error, reply); } });
  app.post("/api/v2/agent/v4/tasks/:taskId/cancel", { preHandler: run }, async (request, reply) => { try { return reply.send(await app.agentV4Runtime.cancel({ taskId: String((request.params as any).taskId), context: { tenantId: request.ctx.tenantId!, userId: request.ctx.userId } })); } catch (error) { return sendV4Error(error, reply); } });
  app.post("/api/v2/agent/v4/tasks/:taskId/retry-item", { preHandler: run }, async (request, reply) => { try { return reply.send(await app.agentV4Runtime.retryItem({ taskId: String((request.params as any).taskId), context: { tenantId: request.ctx.tenantId!, userId: request.ctx.userId }, ...agentV4RetryItemInputSchema.parse(request.body) })); } catch (error) { return sendV4Error(error, reply); } });
  const undo = async (request: any, reply: any) => { try { return reply.send(await app.agentV4Runtime.undo({ taskId: String(request.params.taskId), context: { tenantId: request.ctx.tenantId!, userId: request.ctx.userId }, ...agentV4UndoInputSchema.parse(request.body) })); } catch (error) { return sendV4Error(error, reply); } };
  app.post("/api/v2/agent/v4/tasks/:taskId/undo", { preHandler: [requireAuth, requireTenant, requirePermission("flow:update")] }, undo);
  app.post("/api/v2/agent/v4/tasks/:taskId/undo-canvas", { preHandler: [requireAuth, requireTenant, requirePermission("flow:update")] }, undo);
}
