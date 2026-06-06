import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import {
  requireAuth,
  requirePermission,
  requireTenant,
} from "../../http/auth-middleware.js";
import {
  type InstallPluginInput,
  type ListPluginsQuery,
  type PluginInstallParams,
  type PluginPackageParams,
  installPluginSchema,
  listPluginsQuerySchema,
  pluginInstallParamsSchema,
  pluginPackageParamsSchema,
} from "./ai-plugins.schemas.js";
import { AiPluginApiError } from "./ai-plugins.service.js";

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

function getTenantContext(request: FastifyRequest) {
  if (!request.ctx.tenantId) {
    throw new AiPluginApiError(400, "TENANT_REQUIRED", "Current request is missing tenant context");
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

  if (error instanceof AiPluginApiError) {
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
    "ai plugin admin route failed",
  );
  return sendError(request, reply, 500, "INTERNAL_ERROR", "Service is temporarily unavailable");
}

export function registerAiPluginAdminRoutes(app: FastifyInstance): void {
  const authHandlers = [requireAuth, requireTenant];
  const readHandlers = [...authHandlers, requirePermission("provider:read")];
  const manageHandlers = [...authHandlers, requirePermission("provider:manage")];

  app.get(
    "/api/v2/admin/ai/plugins",
    {
      preHandler: readHandlers,
    },
    async (request, reply) => {
      try {
        const query = listPluginsQuerySchema.parse(request.query) as ListPluginsQuery;
        return reply.send(await app.aiPluginService.listPlugins(getTenantContext(request), query));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/admin/ai/plugins/:packageKey",
    {
      preHandler: readHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<PluginPackageParams>(request, pluginPackageParamsSchema);
        return reply.send(await app.aiPluginService.getPlugin(getTenantContext(request), params.packageKey));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/ai/plugins/:packageKey/install",
    {
      preHandler: manageHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<PluginPackageParams>(request, pluginPackageParamsSchema);
        const body = parseBody<InstallPluginInput>(request, installPluginSchema);
        return reply.code(201).send(
          await app.aiPluginService.installPlugin(
            getTenantContext(request),
            params.packageKey,
            body,
          ),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/ai/plugins/:installId/publish",
    {
      preHandler: manageHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<PluginInstallParams>(request, pluginInstallParamsSchema);
        return reply.send(await app.aiPluginService.publishInstall(getTenantContext(request), params.installId));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/ai/plugins/:installId/disable",
    {
      preHandler: manageHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<PluginInstallParams>(request, pluginInstallParamsSchema);
        return reply.send(await app.aiPluginService.disableInstall(getTenantContext(request), params.installId));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );
}
