import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import {
  requireAuth,
  requirePermission,
  requireTenant,
} from "../../http/auth-middleware.js";
import {
  type AdminAdjustCreditsInput,
  type AdminCreateRedeemCodeInput,
  type AdminAiRouteStatsQuery,
  type AdminAnnouncementParams,
  type AdminAnnouncementsQuery,
  type AdminCreateAnnouncementInput,
  type AdminGrantCreditsInput,
  type AdminRedeemCodeParams,
  type AdminRedeemCodesQuery,
  type AdminResetPasswordInput,
  type AdminUpdateMembershipTierInput,
  type AdminUpdateAnnouncementInput,
  type AdminUpdateUserRoleInput,
  type AdminUpdateUserStatusInput,
  type AdminUserParams,
  type AdminUsersQuery,
  type AdminWorkflowRunParams,
  type AdminWorkflowRunsQuery,
  adminAdjustCreditsSchema,
  adminAiRouteStatsQuerySchema,
  adminAnnouncementParamsSchema,
  adminAnnouncementsQuerySchema,
  adminCreateAnnouncementSchema,
  adminCreateRedeemCodeSchema,
  adminGrantCreditsSchema,
  adminRedeemCodeParamsSchema,
  adminRedeemCodesQuerySchema,
  adminResetPasswordSchema,
  adminUpdateMembershipTierSchema,
  adminUpdateAnnouncementSchema,
  adminUpdateUserRoleSchema,
  adminUpdateUserStatusSchema,
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
  return sendError(request, reply, 500, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试。");
}

export function registerAdminRoutes(app: FastifyInstance): void {
  const adminHandlers = [
    requireAuth,
    requireTenant,
    requirePermission("admin:system"),
  ];
  const authenticatedTenantHandlers = [
    requireAuth,
    requireTenant,
  ];

  app.get(
    "/api/v2/announcements",
    {
      preHandler: authenticatedTenantHandlers,
    },
    async (request, reply) => {
      try {
        const query = parseQuery<AdminAnnouncementsQuery>(request, adminAnnouncementsQuerySchema);
        return reply.send(await app.adminService.listPublishedAnnouncements(request.ctx, query));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/announcements/:announcementId/read",
    {
      preHandler: authenticatedTenantHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<AdminAnnouncementParams>(request, adminAnnouncementParamsSchema);
        return reply.send(await app.adminService.markAnnouncementRead(request.ctx, params.announcementId));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

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
            expiresAt: body.expiresAt,
            idempotencyKey: body.idempotencyKey,
            reason: body.reason,
            targetUserId: params.userId,
            tenantId: body.tenantId,
            validityDays: body.validityDays,
            validityMode: body.validityMode,
            validityMonths: body.validityMonths,
          }),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/users/:userId/adjust-credits",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<AdminUserParams>(request, adminUserParamsSchema);
        const body = parseBody<AdminAdjustCreditsInput>(request, adminAdjustCreditsSchema);
        return reply.send(
          await app.adminService.adjustCredits(request.ctx, {
            credits: body.credits,
            direction: body.direction,
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

  app.patch(
    "/api/v2/admin/users/:userId/status",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<AdminUserParams>(request, adminUserParamsSchema);
        const body = parseBody<AdminUpdateUserStatusInput>(request, adminUpdateUserStatusSchema);
        return reply.send(
          await app.adminService.updateUserStatus(request.ctx, {
            status: body.status,
            targetUserId: params.userId,
          }),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.patch(
    "/api/v2/admin/users/:userId/membership-tier",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<AdminUserParams>(request, adminUserParamsSchema);
        const body = parseBody<AdminUpdateMembershipTierInput>(request, adminUpdateMembershipTierSchema);
        return reply.send(
          await app.adminService.updateMembershipTier(request.ctx, {
            expiresAt: body.expiresAt,
            targetUserId: params.userId,
            tenantId: body.tenantId,
            tier: body.tier,
          }),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.patch(
    "/api/v2/admin/users/:userId/role",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<AdminUserParams>(request, adminUserParamsSchema);
        const body = parseBody<AdminUpdateUserRoleInput>(request, adminUpdateUserRoleSchema);
        return reply.send(
          await app.adminService.updateUserRole(request.ctx, {
            roleKey: body.roleKey,
            targetUserId: params.userId,
            tenantId: body.tenantId,
          }),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/admin/redeem-codes",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const query = parseQuery<AdminRedeemCodesQuery>(request, adminRedeemCodesQuerySchema);
        return reply.send(await app.adminService.listRedeemCodes(request.ctx, query));
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

  app.get(
    "/api/v2/admin/redeem-codes/:codeId/redemptions",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<AdminRedeemCodeParams>(request, adminRedeemCodeParamsSchema);
        return reply.send(await app.adminService.listRedeemCodeRedemptions(request.ctx, params.codeId));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.delete(
    "/api/v2/admin/redeem-codes/:codeId",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<AdminRedeemCodeParams>(request, adminRedeemCodeParamsSchema);
        await app.adminService.deleteRedeemCode(request.ctx, params.codeId);
        return reply.code(204).send();
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
    "/api/v2/admin/announcements",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const query = parseQuery<AdminAnnouncementsQuery>(request, adminAnnouncementsQuerySchema);
        return reply.send(await app.adminService.listAnnouncements(request.ctx, query));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/announcements",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const body = parseBody<AdminCreateAnnouncementInput>(request, adminCreateAnnouncementSchema);
        return reply.code(201).send(await app.adminService.createAnnouncement(request.ctx, body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.patch(
    "/api/v2/admin/announcements/:announcementId",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<AdminAnnouncementParams>(request, adminAnnouncementParamsSchema);
        const body = parseBody<AdminUpdateAnnouncementInput>(request, adminUpdateAnnouncementSchema);
        return reply.send(await app.adminService.updateAnnouncement(request.ctx, params.announcementId, body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.delete(
    "/api/v2/admin/announcements/:announcementId",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<AdminAnnouncementParams>(request, adminAnnouncementParamsSchema);
        await app.adminService.deleteAnnouncement(request.ctx, params.announcementId);
        return reply.code(204).send();
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/admin/ai/route-stats",
    {
      preHandler: adminHandlers,
    },
    async (request, reply) => {
      try {
        const query = parseQuery<AdminAiRouteStatsQuery>(request, adminAiRouteStatsQuerySchema);
        return reply.send(await app.adminService.getAiRouteStats(request.ctx, query));
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
