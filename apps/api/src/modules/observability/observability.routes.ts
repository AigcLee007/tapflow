import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { PlatformTransactionError } from "../../http/platform-transaction.js";

import {
  requireAuth,
  requirePermission,
  requireTenant,
} from "../../http/auth-middleware.js";

function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
) {
  return reply.code(statusCode).send({
    error: {
      code,
      message,
      requestId: request.ctx.requestId,
    },
  });
}

function getObservabilityContext(request: FastifyRequest) {
  return {
    tenantId: request.ctx.tenantId,
    userId: request.ctx.userId,
  };
}

export function registerObservabilityRoutes(app: FastifyInstance): void {
  const adminHandlers = [
    requireAuth,
    requirePermission("platform:console:access"),
  ];

  app.get(
    "/api/v2/admin/health",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        return reply.send(await app.observabilityService.getAdminHealth());
      } catch (error) {
        if (error instanceof PlatformTransactionError) return sendError(request, reply, error.statusCode, error.code, error.message);
        request.log.error(
          {
            err: error,
            requestId: request.ctx.requestId,
            tenantId: request.ctx.tenantId,
            traceId: request.ctx.traceId,
            userId: request.ctx.userId,
          },
          "admin health route failed",
        );
        return sendError(request, reply, 500, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试。");
      }
    },
  );

  app.get(
    "/api/v2/admin/metrics",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        return reply.send(
          await app.observabilityService.getAdminMetrics(getObservabilityContext(request)),
        );
      } catch (error) {
        if (error instanceof PlatformTransactionError) return sendError(request, reply, error.statusCode, error.code, error.message);
        request.log.error(
          {
            err: error,
            requestId: request.ctx.requestId,
            tenantId: request.ctx.tenantId,
            traceId: request.ctx.traceId,
            userId: request.ctx.userId,
          },
          "admin metrics route failed",
        );
        return sendError(request, reply, 500, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试。");
      }
    },
  );
}
