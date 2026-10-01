import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AiGatewayError } from "@aigc-flow/ai-gateway-core";

import { requireAuth, requirePermission, requireTenant } from "../../http/auth-middleware.js";
import {
  createSessionSchema,
  fileParamsSchema,
  flowParamsSchema,
  listSessionsQuerySchema,
  postMessageSchema,
  resumeSchema,
  sessionParamsSchema,
  updateSessionSchema,
} from "./canvas-agent.schemas.js";
import type { CanvasAgentRun } from "./canvas-agent.service.js";
import { CanvasAgentError, type CanvasAgentContext, type CanvasAgentEvent } from "./canvas-agent.types.js";

const SSE_KEEPALIVE_MS = 15_000;

function sendError(request: FastifyRequest, reply: FastifyReply, statusCode: number, code: string, message: string, details?: unknown) {
  return reply.code(statusCode).send({ error: { code, details, message, requestId: request.ctx.requestId } });
}

function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) return sendError(request, reply, 400, "VALIDATION_ERROR", "请求参数不正确", error.issues);
  if (error instanceof CanvasAgentError) return sendError(request, reply, error.statusCode, error.code, error.message);
  if (error instanceof AiGatewayError) return sendError(request, reply, 502, error.code, "模型服务暂时不可用，请稍后重试。");
  throw error;
}

function getContext(request: FastifyRequest): CanvasAgentContext {
  if (!request.ctx.tenantId || !request.ctx.userId) {
    throw new CanvasAgentError(401, "CANVAS_AGENT_USER_REQUIRED", "请先登录。");
  }
  return { permissions: request.ctx.permissions ?? [], tenantId: request.ctx.tenantId, userId: request.ctx.userId };
}

/** Run a claimed agent segment as a Server-Sent Events response. */
async function streamRun(request: FastifyRequest, reply: FastifyReply, run: CanvasAgentRun): Promise<void> {
  // Keep headers plugins already set (CORS, security) before taking over the raw response.
  for (const [key, value] of Object.entries(reply.getHeaders())) {
    if (value !== undefined) reply.raw.setHeader(key, value as string | number | readonly string[]);
  }
  reply.raw.statusCode = 200;
  reply.raw.setHeader("cache-control", "no-cache, no-transform");
  reply.raw.setHeader("connection", "keep-alive");
  reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
  reply.raw.setHeader("x-accel-buffering", "no");
  reply.hijack();
  reply.raw.flushHeaders?.();

  const controller = new AbortController();
  const onClose = () => controller.abort();
  reply.raw.on("close", onClose);
  const writable = () => !reply.raw.writableEnded && !reply.raw.destroyed;
  const write = (event: CanvasAgentEvent) => {
    if (writable()) reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  const keepalive = setInterval(() => { if (writable()) reply.raw.write(": ping\n\n"); }, SSE_KEEPALIVE_MS);
  try {
    await run(write, controller.signal);
  } catch (error) {
    request.log.error({ err: error }, "canvas agent stream failed");
    write({ code: "CANVAS_AGENT_INTERNAL_ERROR", message: "Agent 出错了，请稍后重试。", type: "error" });
    write({ reason: "completed", type: "done" });
  } finally {
    clearInterval(keepalive);
    reply.raw.off("close", onClose);
    if (writable()) reply.raw.end();
  }
}

export function registerCanvasAgentRoutes(app: FastifyInstance, options: { enabled: boolean }): void {
  const enabledGuard = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!options.enabled) return sendError(request, reply, 503, "CANVAS_AGENT_DISABLED", "画布 Agent 未开启。");
  };
  const read = { preHandler: [requireAuth, requireTenant, enabledGuard, requirePermission("flow:read")] };
  const write = { preHandler: [requireAuth, requireTenant, enabledGuard, requirePermission("flow:update")] };
  const base = "/api/v2/canvas-agent";

  app.post(`${base}/sessions`, write, async (request, reply) => {
    try {
      const body = createSessionSchema.parse(request.body);
      return reply.code(201).send(await app.canvasAgentService.createSession(getContext(request), body));
    } catch (error) { return handleError(error, request, reply); }
  });

  app.get(`${base}/sessions`, read, async (request, reply) => {
    try {
      const query = listSessionsQuerySchema.parse(request.query);
      return reply.send({ items: await app.canvasAgentService.listSessions(getContext(request), query.flowId) });
    } catch (error) { return handleError(error, request, reply); }
  });

  app.get(`${base}/sessions/:sessionId`, read, async (request, reply) => {
    try {
      const params = sessionParamsSchema.parse(request.params);
      return reply.send(await app.canvasAgentService.getSessionDetail(getContext(request), params.sessionId));
    } catch (error) { return handleError(error, request, reply); }
  });

  app.patch(`${base}/sessions/:sessionId`, write, async (request, reply) => {
    try {
      const params = sessionParamsSchema.parse(request.params);
      const body = updateSessionSchema.parse(request.body);
      return reply.send(await app.canvasAgentService.updateSession(getContext(request), params.sessionId, body));
    } catch (error) { return handleError(error, request, reply); }
  });

  app.post(`${base}/sessions/:sessionId/messages`, write, async (request, reply) => {
    let run: CanvasAgentRun;
    try {
      const params = sessionParamsSchema.parse(request.params);
      const body = postMessageSchema.parse(request.body);
      run = await app.canvasAgentService.startMessage(getContext(request), params.sessionId, { canvas: body.canvas ?? null, content: body.content });
    } catch (error) { return handleError(error, request, reply); }
    await streamRun(request, reply, run);
  });

  app.post(`${base}/sessions/:sessionId/resume`, write, async (request, reply) => {
    let run: CanvasAgentRun;
    try {
      const params = sessionParamsSchema.parse(request.params);
      const body = resumeSchema.parse(request.body);
      run = await app.canvasAgentService.startResume(getContext(request), params.sessionId, { callId: body.callId, canvas: body.canvas ?? null, payload: body.payload });
    } catch (error) { return handleError(error, request, reply); }
    await streamRun(request, reply, run);
  });

  app.post(`${base}/sessions/:sessionId/stop`, write, async (request, reply) => {
    try {
      const params = sessionParamsSchema.parse(request.params);
      return reply.send(await app.canvasAgentService.stop(getContext(request), params.sessionId));
    } catch (error) { return handleError(error, request, reply); }
  });

  app.get(`${base}/flows/:flowId/files`, read, async (request, reply) => {
    try {
      const params = flowParamsSchema.parse(request.params);
      return reply.send({ items: await app.canvasAgentService.listFiles(getContext(request), params.flowId) });
    } catch (error) { return handleError(error, request, reply); }
  });

  app.get(`${base}/flows/:flowId/files/:path`, read, async (request, reply) => {
    try {
      const params = fileParamsSchema.parse(request.params);
      return reply.send(await app.canvasAgentService.readFile(getContext(request), params.flowId, params.path));
    } catch (error) { return handleError(error, request, reply); }
  });

  app.get(`${base}/image-models`, read, async (request, reply) => {
    try {
      return reply.send(await app.canvasAgentService.listImageModels(getContext(request)));
    } catch (error) { return handleError(error, request, reply); }
  });
}
