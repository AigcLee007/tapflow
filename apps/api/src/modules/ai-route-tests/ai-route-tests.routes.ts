import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import {
  requireAuth,
  requirePermission,
  requireTenant,
} from "../../http/auth-middleware.js";
import {
  type RouteTestParams,
  type RunRouteTestInput,
  routeTestParamsSchema,
  runRouteTestSchema,
} from "./ai-route-tests.schemas.js";
import { AiRouteTestApiError } from "./ai-route-tests.service.js";

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

function getTenantContext(request: FastifyRequest) {
  if (!request.ctx.tenantId) {
    throw new AiRouteTestApiError(400, "TENANT_REQUIRED", "Current request is missing tenant context");
  }

  return {
    ipHash: request.ctx.ipHash,
    requestId: request.ctx.requestId,
    tenantId: request.ctx.tenantId,
    traceId: request.ctx.traceId,
    userAgent: request.ctx.userAgent,
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

  if (error instanceof AiRouteTestApiError) {
    return sendError(request, reply, error.statusCode, error.code, error.message);
  }

  request.log.error(
    {
      err: error,
      requestId: request.ctx.requestId,
      tenantId: request.ctx.tenantId,
      traceId: request.ctx.traceId,
      userId: request.ctx.userId,
    },
    "ai route test route failed",
  );
  return sendError(request, reply, 500, "INTERNAL_ERROR", "Service is temporarily unavailable");
}

export function registerAiRouteTestRoutes(app: FastifyInstance): void {
  const authHandlers = [requireAuth, requireTenant, requirePermission("admin:system")];

  app.post(
    "/api/v2/admin/ai/routes/:routeId/test",
    {
      preHandler: authHandlers,
    },
    async (request, reply) => {
      try {
        const params = routeTestParamsSchema.parse(request.params) as RouteTestParams;
        const body = runRouteTestSchema.parse(request.body ?? {}) as RunRouteTestInput;
        return reply.send(
          await app.aiRouteTestService.testAdminDraftRoute(
            getTenantContext(request),
            params.routeId,
            body,
          ),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );
}
