import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import {
  requireAuth,
  requirePermission,
  requireTenant,
} from "../../http/auth-middleware.js";
import {
  type PublishModelConfigurationInput,
  type SaveModelConfigurationDraftInput,
  publishModelConfigurationSchema,
  saveModelConfigurationDraftSchema,
} from "./ai-model-configurations.schemas.js";
import { AiModelConfigurationApiError } from "./ai-model-configurations.service.js";

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
    throw new AiModelConfigurationApiError(400, "TENANT_REQUIRED", "Current request is missing tenant context");
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

function getPublicDetails(details: unknown): { fields: string[] } | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return undefined;
  }

  const fields = (details as { fields?: unknown }).fields;
  if (!Array.isArray(fields) || !fields.every((field) => typeof field === "string")) {
    return undefined;
  }

  return { fields };
}

function handleRouteError(error: unknown, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  if (error instanceof ZodError) {
    return sendError(request, reply, 400, "VALIDATION_ERROR", "Request validation failed", error.issues);
  }

  if (error instanceof AiModelConfigurationApiError) {
    return sendError(
      request,
      reply,
      error.statusCode,
      error.code,
      error.message,
      getPublicDetails(error.details),
    );
  }

  request.log.error(
    {
      errorName: error instanceof Error ? error.name : typeof error,
      requestId: request.ctx.requestId,
      tenantId: request.ctx.tenantId,
      traceId: request.ctx.traceId,
      userId: request.ctx.userId,
    },
    "ai model configuration route failed",
  );
  return sendError(request, reply, 500, "INTERNAL_ERROR", "Service is temporarily unavailable");
}

export function registerAiModelConfigurationRoutes(app: FastifyInstance): void {
  const systemAdminHandlers = [requireAuth, requireTenant, requirePermission("admin:system")];

  app.post(
    "/api/v2/admin/ai/model-configurations/draft",
    { preHandler: systemAdminHandlers },
    async (request, reply) => {
      try {
        const body = saveModelConfigurationDraftSchema.parse(request.body) as SaveModelConfigurationDraftInput;
        return reply.code(201).send(await app.aiModelConfigurationsService.saveDraft(getTenantContext(request), body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/ai/model-configurations/publish",
    { preHandler: systemAdminHandlers },
    async (request, reply) => {
      try {
        const body = publishModelConfigurationSchema.parse(request.body) as PublishModelConfigurationInput;
        return reply.send(await app.aiModelConfigurationsService.publish(getTenantContext(request), body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );
}
