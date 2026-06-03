import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import {
  requireAuth,
  requirePermission,
  requireTenant,
} from "../../http/auth-middleware.js";
import {
  type AdminCreateRedeemCodeInput,
  type AdminGrantCreditsInput,
  type AdminResetPasswordInput,
  type AdminUserParams,
  type AdminUsersQuery,
  type AdminWorkflowRunParams,
  type AdminWorkflowRunsQuery,
  adminCreateRedeemCodeSchema,
  adminGrantCreditsSchema,
  adminResetPasswordSchema,
  adminUserParamsSchema,
  adminUsersQuerySchema,
  adminWorkflowRunParamsSchema,
  adminWorkflowRunsQuerySchema,
} from "./admin.schemas.js";
import { AdminApiError } from "./admin.service.js";

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

function handleRouteError(error: unknown, request: FastifyRequest, reply: FastifyReply): FastifyReply {
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

  if (error instanceof AdminApiError) {
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
    "admin route failed",
  );
  return sendError(request, reply, 500, "INTERNAL_ERROR", "Internal server error");
}

export function registerAdminRoutes(app: FastifyInstance): void {
  const adminHandlers = [
    requireAuth,
    requireTenant,
    requirePermission("admin:system"),
  ];

  app.get(
    "/api/v2/admin/users",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const query = parseQuery<AdminUsersQuery>(request, adminUsersQuerySchema);
        return reply.send(await app.adminService.searchUsers(request.ctx, query));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/admin/users/:userId",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<AdminUserParams>(request, adminUserParamsSchema);
        return reply.send(await app.adminService.getUser(request.ctx, params.userId));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/users/:userId/grant-credits",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<AdminUserParams>(request, adminUserParamsSchema);
        const body = parseBody<AdminGrantCreditsInput>(request, adminGrantCreditsSchema);
        return reply.send(
          await app.adminService.grantCredits(request.ctx, {
            credits: body.credits,
            idempotencyKey: body.idempotencyKey,
            reason: body.reason,
            targetUserId: params.userId,
            tenantId: body.tenantId,
          }),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/redeem-codes",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const body = parseBody<AdminCreateRedeemCodeInput>(request, adminCreateRedeemCodeSchema);
        return reply.code(201).send(await app.adminService.createRedeemCode(request.ctx, body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/users/:userId/reset-password",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<AdminUserParams>(request, adminUserParamsSchema);
        const body = parseBody<AdminResetPasswordInput>(request, adminResetPasswordSchema);
        return reply.send(
          await app.adminService.resetPassword(request.ctx, {
            password: body.password,
            userId: params.userId,
          }),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/admin/workflow-runs",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const query = parseQuery<AdminWorkflowRunsQuery>(request, adminWorkflowRunsQuerySchema);
        return reply.send(await app.adminService.listWorkflowRuns(request.ctx, query));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/admin/workflow-runs/:runId",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<AdminWorkflowRunParams>(request, adminWorkflowRunParamsSchema);
        return reply.send(await app.adminService.getWorkflowRun(request.ctx, params.runId));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );
}
