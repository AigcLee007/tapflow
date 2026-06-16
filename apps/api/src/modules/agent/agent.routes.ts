import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import { requireAuth, requirePermission, requireTenant } from "../../http/auth-middleware.js";
import {
  type AgentSessionIdParams,
  type CreateAgentSessionInput,
  type CreateAgentTurnInput,
  agentSessionIdParamsSchema,
  createAgentSessionSchema,
  createAgentTurnSchema,
} from "./agent.schemas.js";
import { AgentApiError } from "./agent.service.js";

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
