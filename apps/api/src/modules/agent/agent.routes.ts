import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import { requireAuth, requirePermission, requireTenant } from "../../http/auth-middleware.js";
import {
  type AgentSessionIdParams,
  type ApproveAgentToolCallInput,
  type ApplyAgentCanvasOpsInput,
  type CreateAgentMessageInput,
  type CreateAgentSessionInput,
  type CreateAgentTurnInput,
  type ExecuteAgentTurnInput,
  type GetAgentEventsQuery,
  type GetAgentImageRunSettingsEstimateQuery,
  type ListAgentSessionsQuery,
  approveAgentToolCallSchema,
  agentSessionIdParamsSchema,
  applyAgentCanvasOpsSchema,
  createAgentMessageSchema,
  createAgentSessionSchema,
  createAgentTurnSchema,
  executeAgentTurnSchema,
  getAgentEventsQuerySchema,
  getAgentImageRunSettingsEstimateQuerySchema,
  listAgentSessionsQuerySchema,
} from "./agent.schemas.js";
import { AgentApiError } from "./agent.service.js";
import { formatAgentToolEvent } from "./agent-tool-events.js";

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

function getAgentContext(request: FastifyRequest) {
  if (!request.ctx.tenantId) {
    throw new AgentApiError(400, "TENANT_REQUIRED", "Current request is missing tenant context.");
  }

  return {
    tenantId: request.ctx.tenantId,
    userId: request.ctx.userId,
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

  app.post(
    "/api/v2/agent/sessions",
    {
      preHandler: [...authHandlers, requirePermission("flow:read")],
    },
    async (request, reply) => {
      try {
        const body = parseBody<CreateAgentSessionInput>(request, createAgentSessionSchema);
        return reply.code(201).send(await app.agentService.createSession(getAgentContext(request), body));
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
        const query = parseQuery<ListAgentSessionsQuery>(request, listAgentSessionsQuerySchema);
        return reply.send(await app.agentService.listSessions(getAgentContext(request), query));
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
        return reply.send(await app.agentService.getSession(getAgentContext(request), params.sessionId));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
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
        return reply.send(await app.agentService.getSessionHistory(getAgentContext(request), params.sessionId));
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
          await app.agentService.getSessionEvents(
            getAgentContext(request),
            params.sessionId,
            query.afterSeq ?? 0,
          ),
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
        const body = parseBody<CreateAgentTurnInput>(request, createAgentTurnSchema);
        return reply.code(201).send(await app.agentService.createTurn(getAgentContext(request), params.sessionId, body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
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
        const body = parseBody<CreateAgentTurnInput & { routeKey?: string; idempotencyKey?: string }>(request, createAgentTurnSchema.extend({ routeKey: z.string().trim().max(200).optional(), idempotencyKey: z.string().trim().max(200).optional() }));
        startAgentSse(reply);
        try {
          await app.agentService.streamV2TurnEvents(getAgentContext(request), params.sessionId, body, (chunk) => reply.raw.write(chunk));
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
}
