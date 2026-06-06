import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import {
  requireAuth,
  requirePermission,
  requireTenant,
} from "../../http/auth-middleware.js";
import {
  type ModelCatalogParams,
  type ModelCatalogQuery,
  type ModelCatalogRoutesQuery,
  modelCatalogParamsSchema,
  modelCatalogQuerySchema,
  modelCatalogRoutesQuerySchema,
} from "./ai-model-catalog.schemas.js";
import { AiModelCatalogApiError } from "./ai-model-catalog.service.js";

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
    throw new AiModelCatalogApiError(400, "TENANT_REQUIRED", "Current request is missing tenant context");
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

  if (error instanceof AiModelCatalogApiError) {
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
    "ai model catalog route failed",
  );
  return sendError(request, reply, 500, "INTERNAL_ERROR", "Service is temporarily unavailable");
}

export function registerAiModelCatalogRoutes(app: FastifyInstance): void {
  const authHandlers = [requireAuth, requireTenant, requirePermission("flow:run")];

  app.get(
    "/api/v2/ai/model-catalog",
    {
      preHandler: authHandlers,
    },
    async (request, reply) => {
      try {
        const query = modelCatalogQuerySchema.parse(request.query) as ModelCatalogQuery;
        return reply.send(await app.aiModelCatalogService.listModels(getTenantContext(request), query));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/ai/model-catalog/:modelKey/routes",
    {
      preHandler: authHandlers,
    },
    async (request, reply) => {
      try {
        const params = modelCatalogParamsSchema.parse(request.params) as ModelCatalogParams;
        const query = modelCatalogRoutesQuerySchema.parse(request.query) as ModelCatalogRoutesQuery;
        return reply.send(
          await app.aiModelCatalogService.listRoutesForModel(
            getTenantContext(request),
            params.modelKey,
            query,
          ),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );
}
