import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z, ZodError } from "zod";
import { requireAuth, requirePermission } from "../../http/auth-middleware.js";
import { PLATFORM_ROLES } from "./platform-access.policy.js";
import { PlatformAccessError } from "./platform-access.service.js";

const userParams = z.object({ userId: z.uuid() }).strict();
const roleChange = z.object({
  roleKey: z.enum(PLATFORM_ROLES).nullable(),
  expectedVersion: z.number().int().min(0).max(2_147_483_646),
  reason: z.string().trim().min(5).max(500),
}).strict();

function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return reply.code(400).send({ error: {
      code: "VALIDATION_ERROR", message: "Request validation failed",
      details: error.issues, requestId: request.ctx.requestId,
    } });
  }
  if (error instanceof PlatformAccessError) {
    return reply.code(error.statusCode).send({ error: {
      code: error.code, message: error.message, requestId: request.ctx.requestId,
    } });
  }
  request.log.error({ err: error, requestId: request.ctx.requestId }, "platform role operation failed");
  return reply.code(500).send({ error: {
    code: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后重试。", requestId: request.ctx.requestId,
  } });
}

export function registerPlatformAccessRoutes(app: FastifyInstance): void {
  const preHandler = [requireAuth, requirePermission("platform:roles:manage")];
  app.get("/api/v2/admin/platform-roles", { preHandler }, async (request, reply) => {
    try {
      return { items: await app.platformAccessService.listAssignments(request.ctx) };
    } catch (error) { return handleError(error, request, reply); }
  });
  app.patch("/api/v2/admin/platform-roles/:userId", { preHandler }, async (request, reply) => {
    try {
      const params = userParams.parse(request.params);
      const body = roleChange.parse(request.body);
      return { assignment: await app.platformAccessService.changeRole(request.ctx, {
        targetUserId: params.userId, ...body,
      }) };
    } catch (error) { return handleError(error, request, reply); }
  });
}
