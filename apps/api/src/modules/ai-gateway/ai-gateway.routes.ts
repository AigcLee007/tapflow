import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import { AiGatewayError } from "@aigc-flow/ai-gateway-core";

import {
  requireAuth,
  requirePermission,
  requireTenant,
} from "../../http/auth-middleware.js";
import {
  type ConnectionIdParams,
  type CreateCredentialInput,
  type CreateModelInput,
  type CreateProviderConnectionInput,
  type CreateProviderInput,
  type CreateRouteInput,
  type CredentialIdParams,
  type GenerateTextInput,
  type RotateCredentialInput,
  type RouteIdParams,
  type ListRuntimeRoutesQuery,
  type ListPricingQuery,
  type UpsertPricingInput,
  type UpdateCredentialInput,
  type UpdateProviderConnectionInput,
  type UpdateRouteInput,
  connectionIdParamsSchema,
  createCredentialSchema,
  generateTextSchema,
  createModelSchema,
  createProviderConnectionSchema,
  createProviderSchema,
  createRouteSchema,
  credentialIdParamsSchema,
  rotateCredentialSchema,
  routeIdParamsSchema,
  listRuntimeRoutesQuerySchema,
  listPricingQuerySchema,
  updateCredentialSchema,
  updateProviderConnectionSchema,
  upsertPricingSchema,
  updateRouteSchema,
} from "./ai-gateway.schemas.js";
import { AiGatewayApiError } from "./ai-gateway.service.js";

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
    throw new AiGatewayApiError(400, "TENANT_REQUIRED", "当前请求缺少工作区上下文");
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

  if (error instanceof AiGatewayApiError) {
    return sendError(request, reply, error.statusCode, error.code, error.message);
  }

  if (error instanceof AiGatewayError) {
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
    "ai gateway admin route failed",
  );
  return sendError(request, reply, 500, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试。");
}

export function registerAiGatewayAdminRoutes(app: FastifyInstance): void {
  const authHandlers = [requireAuth, requireTenant];
  const requirePermissionForAdmin = (permissionKey: string) => {
    const permissionGuard = requirePermission(permissionKey);
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await permissionGuard(request, reply);
    };
  };

  app.post(
    "/api/v2/ai/text/generate",
    {
      preHandler: [...authHandlers, requirePermission("provider:read")],
    },
    async (request, reply) => {
      try {
        const body = parseBody<GenerateTextInput>(request, generateTextSchema);
        return reply.send(await app.aiGatewayService.generateText(getTenantContext(request), body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/ai/routes",
    {
      preHandler: [...authHandlers, requirePermission("flow:run")],
    },
    async (request, reply) => {
      try {
        const query = listRuntimeRoutesQuerySchema.parse(request.query) as ListRuntimeRoutesQuery;
        return reply.send(await app.aiGatewayService.listRuntimeRoutesForUi(getTenantContext(request), query));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/admin/ai/connections",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("provider:read")],
    },
    async (request, reply) => {
      try {
        return reply.send(await app.aiGatewayService.listProviderConnections(getTenantContext(request)));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/ai/connections",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("provider:manage")],
    },
    async (request, reply) => {
      try {
        const body = parseBody<CreateProviderConnectionInput>(request, createProviderConnectionSchema);
        return reply.code(201).send(
          await app.aiGatewayService.createProviderConnection(getTenantContext(request), body),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.patch(
    "/api/v2/admin/ai/connections/:connectionId",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("provider:manage")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<ConnectionIdParams>(request, connectionIdParamsSchema);
        const body = parseBody<UpdateProviderConnectionInput>(request, updateProviderConnectionSchema);
        return reply.send(
          await app.aiGatewayService.updateProviderConnection(
            getTenantContext(request),
            params.connectionId,
            body,
          ),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.delete(
    "/api/v2/admin/ai/connections/:connectionId",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("provider:manage")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<ConnectionIdParams>(request, connectionIdParamsSchema);
        return reply.send(
          await app.aiGatewayService.deleteProviderConnection(
            getTenantContext(request),
            params.connectionId,
          ),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/admin/ai/providers",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("provider:read")],
    },
    async (request, reply) => {
      try {
        return reply.send(await app.aiGatewayService.listProviders());
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/ai/providers",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("provider:manage")],
    },
    async (request, reply) => {
      try {
        const body = parseBody<CreateProviderInput>(request, createProviderSchema);
        return reply.code(201).send(await app.aiGatewayService.createProvider(getTenantContext(request), body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/admin/ai/models",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("provider:read")],
    },
    async (request, reply) => {
      try {
        return reply.send(await app.aiGatewayService.listModels());
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/ai/models",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("provider:manage")],
    },
    async (request, reply) => {
      try {
        const body = parseBody<CreateModelInput>(request, createModelSchema);
        return reply.code(201).send(await app.aiGatewayService.createModel(getTenantContext(request), body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/admin/ai/routes",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("provider:read")],
    },
    async (request, reply) => {
      try {
        return reply.send(await app.aiGatewayService.listRoutes(getTenantContext(request)));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/ai/routes",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("provider:manage")],
    },
    async (request, reply) => {
      try {
        const body = parseBody<CreateRouteInput>(request, createRouteSchema);
        return reply.code(201).send(await app.aiGatewayService.createRoute(getTenantContext(request), body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.patch(
    "/api/v2/admin/ai/routes/:routeId",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("provider:manage")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<RouteIdParams>(request, routeIdParamsSchema);
        const body = parseBody<UpdateRouteInput>(request, updateRouteSchema);
        return reply.send(
          await app.aiGatewayService.updateRoute(getTenantContext(request), params.routeId, body),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/admin/credentials",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("credential:manage")],
    },
    async (request, reply) => {
      try {
        return reply.send(await app.aiGatewayService.listCredentials(getTenantContext(request)));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/credentials",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("credential:manage")],
    },
    async (request, reply) => {
      try {
        const body = parseBody<CreateCredentialInput>(request, createCredentialSchema);
        return reply.code(201).send(
          await app.aiGatewayService.createCredential(getTenantContext(request), body),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.patch(
    "/api/v2/admin/credentials/:credentialId",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("credential:manage")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<CredentialIdParams>(request, credentialIdParamsSchema);
        const body = parseBody<UpdateCredentialInput>(request, updateCredentialSchema);
        return reply.send(
          await app.aiGatewayService.updateCredential(
            getTenantContext(request),
            params.credentialId,
            body,
          ),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/credentials/:credentialId/rotate",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("credential:manage")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<CredentialIdParams>(request, credentialIdParamsSchema);
        const body = parseBody<RotateCredentialInput>(request, rotateCredentialSchema);
        return reply.send(
          await app.aiGatewayService.rotateCredential(
            getTenantContext(request),
            params.credentialId,
            body.secret,
          ),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.delete(
    "/api/v2/admin/credentials/:credentialId",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("credential:manage")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<CredentialIdParams>(request, credentialIdParamsSchema);
        return reply.send(
          await app.aiGatewayService.deleteCredential(
            getTenantContext(request),
            params.credentialId,
          ),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/admin/ai/pricing",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("provider:read")],
    },
    async (request, reply) => {
      try {
        const query = listPricingQuerySchema.parse(request.query) as ListPricingQuery;
        return reply.send(await app.aiGatewayService.listPricing(getTenantContext(request), query));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.patch(
    "/api/v2/admin/ai/pricing",
    {
      preHandler: [...authHandlers, requirePermissionForAdmin("provider:manage")],
    },
    async (request, reply) => {
      try {
        const body = parseBody<UpsertPricingInput>(request, upsertPricingSchema);
        return reply.send(await app.aiGatewayService.upsertPricing(getTenantContext(request), body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );
}
