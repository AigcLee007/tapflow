import type { FastifyInstance } from "fastify";
import { requireAuth, requirePermission, requireTenant } from "../../../http/auth-middleware.js";
import { agentV4RetryItemInputSchema, agentV4TurnInputSchema, agentV4UndoInputSchema } from "./agent-v4-schemas.js";

export function registerAgentV4Routes(app: FastifyInstance): void {
  const read = [requireAuth, requireTenant, requirePermission("flow:read")];
  const run = [requireAuth, requireTenant, requirePermission("flow:run")];
  app.post("/api/v2/agent/v4/sessions/:sessionId/turns", { preHandler: read }, async (request, reply) => {
    try { const result = await app.agentV4Runtime.startTurn({ sessionId: String((request.params as any).sessionId), context: { tenantId: request.ctx.tenantId!, userId: request.ctx.userId }, body: agentV4TurnInputSchema.parse(request.body) }); return reply.send(result); }
    catch (error) { return reply.code(error && typeof error === "object" && "statusCode" in error ? Number((error as any).statusCode) : 500).send({ error: { code: error instanceof Error ? error.message : "INTERNAL_ERROR" } }); }
  });
  app.get("/api/v2/agent/v4/tasks/:taskId/events", { preHandler: read }, async (request, reply) => {
    const params = request.params as { taskId: string }; const query = request.query as { afterSeq?: string | number };
    const events = await app.agentV4Runtime.replayEvents({ tenantId: request.ctx.tenantId!, taskId: params.taskId, afterSeq: Math.max(0, Number(query.afterSeq ?? 0)) });
    reply.raw.setHeader("cache-control", "no-cache"); reply.raw.setHeader("connection", "keep-alive"); reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8"); reply.hijack();
    for (const event of events) reply.raw.write(`event: event\ndata: ${JSON.stringify({ sequence: event.seq, type: event.eventType, ...event.eventJson })}\n\n`);
    reply.raw.write(`event: done\ndata: ${JSON.stringify({ taskId: params.taskId })}\n\n`); reply.raw.end(); return reply;
  });
  app.post("/api/v2/agent/v4/tasks/:taskId/approve", { preHandler: run }, async (request, reply) => reply.send(await app.agentV4Runtime.approve({ taskId: String((request.params as any).taskId), context: { tenantId: request.ctx.tenantId!, userId: request.ctx.userId }, approved: (request.body as any)?.approved !== false })));
  app.post("/api/v2/agent/v4/tasks/:taskId/cancel", { preHandler: run }, async (request, reply) => reply.send(await app.agentV4Runtime.cancel({ taskId: String((request.params as any).taskId), context: { tenantId: request.ctx.tenantId!, userId: request.ctx.userId } })));
  app.post("/api/v2/agent/v4/tasks/:taskId/retry-item", { preHandler: run }, async (request, reply) => reply.send(await app.agentV4Runtime.retryItem({ taskId: String((request.params as any).taskId), context: { tenantId: request.ctx.tenantId!, userId: request.ctx.userId }, ...agentV4RetryItemInputSchema.parse(request.body) })));
  app.post("/api/v2/agent/v4/tasks/:taskId/undo", { preHandler: [requireAuth, requireTenant, requirePermission("flow:update")] }, async (request, reply) => reply.send(await app.agentV4Runtime.undo({ taskId: String((request.params as any).taskId), context: { tenantId: request.ctx.tenantId!, userId: request.ctx.userId }, ...agentV4UndoInputSchema.parse(request.body) })));
}
