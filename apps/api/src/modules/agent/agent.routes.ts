import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z, ZodError } from "zod";

import { requireAuth, requirePermission, requireTenant } from "../../http/auth-middleware.js";
import {
  type AgentSessionIdParams,
  type ApproveAgentToolCallInput,
  type ApplyAgentCanvasOpsInput,
  type CreateAgentV5DecisionInput,
  type CreateAgentV5TurnInput,
  type AgentSessionScopeInput,
  type CancelAgentTurnInput,
  type CreateAgentMessageInput,
  type CreateAgentSessionInput,
  type CreateAgentTurnInput,
  type ExecuteAgentTurnInput,
  type GetAgentEventsQuery,
  type GetAgentImageRunSettingsEstimateQuery,
  type ListAgentSessionsQuery,
  type UpdateAgentV5ModeInput,
  approveAgentToolCallSchema,
  agentSessionIdParamsSchema,
  applyAgentCanvasOpsSchema,
  createAgentMessageSchema,
  createAgentSessionSchema,
  createAgentTurnSchema,
  createAgentV5DecisionSchema,
  createAgentV5TurnSchema,
  agentSessionScopeSchema,
  cancelAgentTurnSchema,
  executeAgentTurnSchema,
  getAgentEventsQuerySchema,
  getAgentImageRunSettingsEstimateQuerySchema,
  listAgentSessionsQuerySchema,
  updateAgentV5ModeSchema,
  agentV3ApprovalSchema,
  agentV3EventsQuerySchema,
  agentV3SessionTurnParamsSchema,
  agentV3TaskIdParamsSchema,
  agentV3UndoSchema,
  agentV3RetrySchema,
} from "./agent.schemas.js";
import { AgentApiError } from "./agent.service.js";
import { formatAgentToolEvent } from "./agent-tool-events.js";
import { projectAgentRuntimeCapabilities } from "./agent-runtime-identity.js";
import { AgentV6Orchestrator, type AgentV6ServicePort } from "./v6/agent-v6-orchestrator.js";
import { agentV6DecisionSchema, agentV6TurnSchema, type AgentV6DecisionInput, type AgentV6TurnInput } from "./v6/agent-v6-schemas.js";
import { agentRuntimeCreateSessionSchema, agentRuntimeSessionFilterSchema, agentRuntimeTurnSchema, agentRuntimeDecisionSchema, agentRuntimeModeSchema } from "./runtime/agent-runtime.schemas.js";

function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return reply.code(statusCode).send({
    error: {
      code,
      details,
      message,
      requestId: request.ctx.requestId,
    },
  });
}

function parseBody<T>(request: FastifyRequest, schema: { parse: (value: unknown) => T }): T {
  return schema.parse(request.body);
}

function parseParams<T>(request: FastifyRequest, schema: { parse: (value: unknown) => T }): T {
  return schema.parse(request.params);
}

function parseQuery<T>(request: FastifyRequest, schema: { parse: (value: unknown) => T }): T {
  return schema.parse(request.query);
}

function formatStreamEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function getAgentContext(request: FastifyRequest) {
  if (!request.ctx.tenantId) {
    throw new AgentApiError(400, "TENANT_REQUIRED", "Current request is missing tenant context.");
  }

  return {
    tenantId: request.ctx.tenantId,
    userId: request.ctx.userId,
    permissions: request.ctx.permissions,
  };
}

function handleRouteError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof ZodError) {
    return sendError(
      request,
      reply,
      400,
      "VALIDATION_ERROR",
      "Request validation failed",
      error.issues,
    );
  }

  if (error instanceof AgentApiError) {
    return sendError(request, reply, error.statusCode, error.code, error.message, error.details);
  }

  request.log.error(
    {
      err: error,
      requestId: request.ctx.requestId,
      tenantId: request.ctx.tenantId,
      traceId: request.ctx.traceId,
      userId: request.ctx.userId,
    },
    "agent route failed",
  );
  return sendError(request, reply, 500, "INTERNAL_ERROR", "Service is temporarily unavailable.");
}

function startAgentSse(reply: FastifyReply) {
  reply.raw.setHeader("cache-control", "no-cache");
  reply.raw.setHeader("connection", "keep-alive");
  reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
  reply.hijack();
}

function writeAgentSseFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  const normalized = error instanceof AgentApiError
    ? { code: error.code, message: error.message }
    : {
        code: "INTERNAL_ERROR",
        message: "Service is temporarily unavailable.",
      };

  if (!(error instanceof AgentApiError)) {
    request.log.error(
      {
        err: error,
        requestId: request.ctx.requestId,
        tenantId: request.ctx.tenantId,
        traceId: request.ctx.traceId,
        userId: request.ctx.userId,
      },
      "agent stream route failed",
    );
  }

  reply.raw.write(formatAgentToolEvent({
    code: normalized.code,
    message: normalized.message,
    type: "turn_failed",
  }));
}

export function registerAgentRoutes(app: FastifyInstance): void {
  const authHandlers = [requireAuth, requireTenant];
  const agentV6Orchestrator = new AgentV6Orchestrator(app.agentService as unknown as AgentV6ServicePort);

  app.get(
    "/api/v2/agent/capabilities",
    { preHandler: [...authHandlers, requirePermission("flow:read")] },
    async (_request, reply) => {
      const env = app.agentService.env;
      const runtimeCapabilities = projectAgentRuntimeCapabilities(env);
      return reply.send({
        ...runtimeCapabilities,
        skillAuthoringEnabled: env.agentSkillsEnabled === true && env.agentSkillAuthoringEnabled === true,
        skillRuntimeEnabled: env.agentSkillsEnabled === true && env.agentSkillRuntimeEnabled === true,
        skillsEnabled: env.agentSkillsEnabled === true,
      });
    },
  );

  app.post(
    "/api/v2/agent/sessions",
    {
      preHandler: [...authHandlers, requirePermission("flow:read")],
    },
    async (request, reply) => {
      try {
        const body = agentRuntimeCreateSessionSchema.parse(request.body);
        return reply.code(201).send(await app.canonicalAgentRuntime.createSession(getAgentContext(request), body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/agent/run-settings/image",
    {
      preHandler: [...authHandlers, requirePermission("flow:read")],
    },
    async (request, reply) => {
      try {
        return reply.send(await app.agentService.listImageRunSettings(getAgentContext(request)));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/agent/run-settings/image/estimate",
    {
      preHandler: [...authHandlers, requirePermission("flow:read")],
    },
    async (request, reply) => {
      try {
        const query = parseQuery<GetAgentImageRunSettingsEstimateQuery>(request, getAgentImageRunSettingsEstimateQuerySchema);
        return reply.send(await app.agentService.estimateImageRunSettings(getAgentContext(request), query));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/agent/sessions",
    {
      preHandler: [...authHandlers, requirePermission("flow:read")],
    },
    async (request, reply) => {
      try {
        const query = agentRuntimeSessionFilterSchema.parse(request.query);
        return reply.send(await app.canonicalAgentRuntime.listSessions(getAgentContext(request), query));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/agent/sessions/:sessionId",
    {
      preHandler: [...authHandlers, requirePermission("flow:read")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        return reply.send(await app.canonicalAgentRuntime.getSession(getAgentContext(request), params.sessionId));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.patch(
    "/api/v2/agent/sessions/:sessionId/mode",
    { preHandler: [...authHandlers, requirePermission("flow:read")] },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const body = agentRuntimeModeSchema.parse(request.body);
        return reply.send(await app.canonicalAgentRuntime.updateSession(getAgentContext(request), params.sessionId, body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/agent/sessions/:sessionId/turns/:turnId",
    { preHandler: [...authHandlers, requirePermission("flow:read")] },
    async (request, reply) => {
      try {
        const params = z.object({ sessionId: z.string().uuid(), turnId: z.string().uuid() }).parse(request.params);
        return reply.send(await app.canonicalAgentRuntime.refreshExecution(getAgentContext(request), params.sessionId, params.turnId));
      } catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.get(
    "/api/v2/agent/sessions/:sessionId/history",
    {
      preHandler: [...authHandlers, requirePermission("flow:read")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const query = z.object({ limit: z.coerce.number().int().min(1).max(100).optional(), cursor: z.string().optional() }).parse(request.query);
        return reply.send(await app.canonicalAgentRuntime.getHistory(getAgentContext(request), params.sessionId, query));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/agent/sessions/:sessionId/events",
    {
      preHandler: [...authHandlers, requirePermission("flow:read")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const query = parseQuery<GetAgentEventsQuery>(request, getAgentEventsQuerySchema);
        return reply.send(
          await app.canonicalAgentRuntime.getEvents(getAgentContext(request), params.sessionId, query.afterSeq ?? 0),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/agent/sessions/:sessionId/events/stream",
    {
      preHandler: [...authHandlers, requirePermission("flow:read")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const query = parseQuery<GetAgentEventsQuery>(request, getAgentEventsQuerySchema);
        const streamBody = await app.agentService.buildSessionEventsStream(
          getAgentContext(request),
          params.sessionId,
          query.afterSeq ?? 0,
          query,
        );

        reply.raw.setHeader("cache-control", "no-cache");
        reply.raw.setHeader("connection", "keep-alive");
        reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
        reply.hijack();
        reply.raw.write(streamBody);
        reply.raw.end();
        return reply;
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/agent/sessions/:sessionId/messages",
    {
      preHandler: [...authHandlers, requirePermission("flow:read")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const body = parseBody<CreateAgentMessageInput>(request, createAgentMessageSchema);
        return reply.code(201).send(await app.agentService.appendMessage(getAgentContext(request), params.sessionId, body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/agent/sessions/:sessionId/turns",
    {
      preHandler: [...authHandlers, requirePermission("flow:read")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const body = agentRuntimeTurnSchema.parse(request.body);
        return reply.code(201).send(await app.canonicalAgentRuntime.submitTurn(getAgentContext(request), params.sessionId, body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/agent/sessions/:sessionId/v5-turns",
    { preHandler: [...authHandlers, requirePermission("flow:read")] },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const body = parseBody<CreateAgentV5TurnInput>(request, createAgentV5TurnSchema);
        return reply.code(201).send(await app.agentService.createV5Turn(getAgentContext(request), params.sessionId, body));
      } catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.post(
    "/api/v2/agent/sessions/:sessionId/turns/:turnId/decisions",
    { preHandler: [...authHandlers, requirePermission("flow:read")] },
    async (request, reply) => {
      try {
        const params = z.object({ sessionId: z.string().uuid(), turnId: z.string().uuid() }).parse(request.params);
        const body = agentRuntimeDecisionSchema.parse(request.body);
        return reply.send(await app.canonicalAgentRuntime.submitDecision(getAgentContext(request), params.sessionId, params.turnId, body));
      } catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.post(
    "/api/v2/agent/sessions/:sessionId/v6-turns",
    { preHandler: [...authHandlers, requirePermission("flow:read")] },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const body = parseBody<AgentV6TurnInput>(request, agentV6TurnSchema);
        return reply.code(201).send(await agentV6Orchestrator.submitTurn(getAgentContext(request), params.sessionId, body));
      } catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.post(
    "/api/v2/agent/sessions/:sessionId/v6-turns/:turnId/decisions",
    { preHandler: [...authHandlers, requirePermission("flow:read")] },
    async (request, reply) => {
      try {
        const params = z.object({ sessionId: z.string().uuid(), turnId: z.string().uuid() }).parse(request.params);
        const body = parseBody<AgentV6DecisionInput>(request, agentV6DecisionSchema);
        return reply.send(await agentV6Orchestrator.submitDecision(getAgentContext(request), params.sessionId, params.turnId, body));
      } catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.patch(
    "/api/v2/agent/sessions/:sessionId/v5-mode",
    { preHandler: [...authHandlers, requirePermission("flow:read")] },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const body = parseBody<UpdateAgentV5ModeInput>(request, updateAgentV5ModeSchema);
        return reply.send(await app.agentService.setV5ExecutionMode(getAgentContext(request), params.sessionId, body));
      } catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.post(
    "/api/v2/agent/sessions/:sessionId/v5-turns/:turnId/decisions",
    { preHandler: [...authHandlers, requirePermission("flow:read")] },
    async (request, reply) => {
      try {
        const params = z.object({ sessionId: z.string().uuid(), turnId: z.string().uuid() }).parse(request.params);
        const body = z.object({ ...agentSessionScopeSchema.shape, decision: createAgentV5DecisionSchema }).strict().parse(request.body) as AgentSessionScopeInput & { decision: CreateAgentV5DecisionInput };
        return reply.send(await app.agentService.recordV5Decision(getAgentContext(request), params.sessionId, params.turnId, body.decision, body));
      } catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.post(
    "/api/v2/agent/sessions/:sessionId/canvas-ops",
    {
      preHandler: [...authHandlers, requirePermission("flow:update")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const body = parseBody<ApplyAgentCanvasOpsInput>(request, applyAgentCanvasOpsSchema);
        return reply.send(
          await app.agentService.applyCanvasOps(
            getAgentContext(request),
            params.sessionId,
            body,
          ),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/agent/sessions/:sessionId/turns/execute/stream",
    {
      preHandler: [...authHandlers, requirePermission("flow:run")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const body = parseBody<ExecuteAgentTurnInput>(request, executeAgentTurnSchema);
        startAgentSse(reply);
        try {
          await app.agentService.streamExecuteTurnEvents(
            getAgentContext(request),
            params.sessionId,
            body,
            (chunk) => {
              reply.raw.write(chunk);
            },
          );
        } catch (streamError) {
          writeAgentSseFailure(streamError, request, reply);
        } finally {
          reply.raw.end();
        }
        return reply;
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/agent/sessions/:sessionId/v2-turns/stream",
    {
      preHandler: [...authHandlers, requirePermission("flow:update")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const body = parseBody<CreateAgentTurnInput & { routeKey?: string }>(request, createAgentTurnSchema.extend({ routeKey: z.string().trim().max(200).optional(), idempotencyKey: z.string().trim().min(1).max(200) }));
        startAgentSse(reply);
        try {
          await app.agentService.streamV2TurnEvents(getAgentContext(request), params.sessionId, body, (chunk) => { reply.raw.write(chunk); });
        } catch (streamError) {
          writeAgentSseFailure(streamError, request, reply);
        } finally {
          reply.raw.end();
        }
        return reply;
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/agent/sessions/:sessionId/turns/v2/stream",
    { preHandler: [...authHandlers, requirePermission("flow:update")] },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const body = parseBody<CreateAgentTurnInput & { routeKey?: string }>(request, createAgentTurnSchema.extend({ routeKey: z.string().trim().max(200).optional(), idempotencyKey: z.string().trim().min(1).max(200) }));
        startAgentSse(reply);
        try { await app.agentService.streamV2TurnEvents(getAgentContext(request), params.sessionId, body, (chunk) => { reply.raw.write(chunk); }); }
        catch (streamError) { writeAgentSseFailure(streamError, request, reply); }
        finally { reply.raw.end(); }
        return reply;
      } catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.post(
    "/api/v2/agent/sessions/:sessionId/cancel",
    { preHandler: [...authHandlers, requirePermission("flow:run")] },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const body = parseBody<CancelAgentTurnInput>(request, cancelAgentTurnSchema);
        return reply.send(await app.agentService.cancelV2Turn(getAgentContext(request), params.sessionId, body));
      } catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.post(
    "/api/v2/agent/sessions/:sessionId/approvals/:approvalId/stream",
    { preHandler: [...authHandlers, requirePermission("flow:run")] },
    async (request, reply) => {
      try {
        const params = z.object({ sessionId: z.string().uuid(), approvalId: z.string().uuid() }).parse(request.params);
        startAgentSse(reply);
        try {
          const result = await app.agentService.approveV2SkillRun(getAgentContext(request), params.sessionId, params.approvalId);
          reply.raw.write(formatStreamEvent("agent_v2_approval", result));
          reply.raw.write(formatStreamEvent("done", { sessionId: params.sessionId, approvalId: params.approvalId }));
        } catch (streamError) { writeAgentSseFailure(streamError, request, reply); }
        finally { reply.raw.end(); }
        return reply;
      } catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.post(
    "/api/v2/agent/sessions/:sessionId/tool-calls/approve/stream",
    {
      preHandler: [...authHandlers, requirePermission("flow:run")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const body = parseBody<ApproveAgentToolCallInput>(request, approveAgentToolCallSchema);
        startAgentSse(reply);
        try {
          await app.agentService.streamApproveToolCallEvents(
            getAgentContext(request),
            params.sessionId,
            body,
            (chunk) => {
              reply.raw.write(chunk);
            },
          );
        } catch (streamError) {
          writeAgentSseFailure(streamError, request, reply);
        } finally {
          reply.raw.end();
        }
        return reply;
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/agent/sessions/:sessionId/turns/stream",
    {
      preHandler: [...authHandlers, requirePermission("flow:read")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AgentSessionIdParams>(request, agentSessionIdParamsSchema);
        const body = parseBody<CreateAgentTurnInput>(request, createAgentTurnSchema);
        const streamBody = await app.agentService.buildTurnStream(getAgentContext(request), params.sessionId, body);

        reply.raw.setHeader("cache-control", "no-cache");
        reply.raw.setHeader("connection", "keep-alive");
        reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
        reply.hijack();
        reply.raw.write(streamBody);
        reply.raw.end();
        return reply;
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  const v3Auth = [...authHandlers, requirePermission("flow:read")];
  app.post("/api/v2/agent/v3/sessions/:sessionId/turns/stream", { preHandler: v3Auth }, async (request, reply) => {
    try {
      const params = agentV3SessionTurnParamsSchema.parse(request.params);
      const body = createAgentTurnSchema.parse(request.body);
      const streamBody: string[] = [];
      const result = await app.agentV3Runtime.startTurn({ sessionId: params.sessionId, input: body, context: getAgentContext(request), writeChunk: (chunk) => { streamBody.push(chunk); } });
      reply.raw.setHeader("cache-control", "no-cache");
      reply.raw.setHeader("connection", "keep-alive");
      reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
      reply.hijack();
      if (streamBody.length) reply.raw.write(streamBody.join(""));
      if (result !== undefined) reply.raw.write(formatStreamEvent("done", result));
      reply.raw.end();
      return reply;
    } catch (error) {
      return handleRouteError(error, request, reply);
    }
  });
  app.get("/api/v2/agent/v3/tasks/:taskId/events", { preHandler: v3Auth }, async (request, reply) => {
    try {
      const params = agentV3TaskIdParamsSchema.parse(request.params);
      const query = agentV3EventsQuerySchema.parse(request.query);
      const events = await app.agentV3Runtime.replayEvents({ tenantId: getAgentContext(request).tenantId, taskId: params.taskId, afterSeq: query.after ?? 0 });
      reply.raw.setHeader("cache-control", "no-cache");
      reply.raw.setHeader("connection", "keep-alive");
      reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
      reply.hijack();
      for (const event of events) reply.raw.write(`event: event\\ndata: ${JSON.stringify({ sequence: event.seq, type: event.eventType, ...event.eventJson })}\\n\\n`);
      reply.raw.write(formatStreamEvent("done", { taskId: params.taskId, after: query.after ?? 0 }));
      reply.raw.end();
      return reply;
    } catch (error) {
      return handleRouteError(error, request, reply);
    }
  });
  app.post("/api/v2/agent/v3/tasks/:taskId/approve", { preHandler: [...authHandlers, requirePermission("flow:run")] }, async (request, reply) => {
    try {
      const params = agentV3TaskIdParamsSchema.parse(request.params);
      const body = agentV3ApprovalSchema.parse(request.body);
      return reply.send(await app.agentV3Runtime.approve({ taskId: params.taskId, context: getAgentContext(request), approved: body.approved !== false }));
    } catch (error) { return handleRouteError(error, request, reply); }
  });
  app.post("/api/v2/agent/v3/tasks/:taskId/cancel", { preHandler: [...authHandlers, requirePermission("flow:run")] }, async (request, reply) => {
    try {
      const params = agentV3TaskIdParamsSchema.parse(request.params);
      return reply.send(await app.agentV3Runtime.cancel({ taskId: params.taskId, context: getAgentContext(request) }));
    } catch (error) { return handleRouteError(error, request, reply); }
  });
  app.post("/api/v2/agent/v3/tasks/:taskId/retry-step", { preHandler: [...authHandlers, requirePermission("flow:run")] }, async (request, reply) => {
    try {
      const params = agentV3TaskIdParamsSchema.parse(request.params);
      const body = agentV3RetrySchema.parse(request.body);
      return reply.send(await app.agentV3Runtime.retryStep({ taskId: params.taskId, context: getAgentContext(request), stepId: body.stepId }));
    } catch (error) { return handleRouteError(error, request, reply); }
  });
  app.post("/api/v2/agent/v3/tasks/:taskId/undo-canvas", { preHandler: [...authHandlers, requirePermission("flow:update")] }, async (request, reply) => {
    try {
      const params = agentV3TaskIdParamsSchema.parse(request.params);
      const body = agentV3UndoSchema.parse(request.body);
      return reply.send(await app.agentV3Runtime.undoCanvas({ taskId: params.taskId, context: getAgentContext(request), expectedRevision: body.expectedRevision }));
    } catch (error) { return handleRouteError(error, request, reply); }
  });
}
