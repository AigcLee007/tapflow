import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z, ZodError } from "zod";

import { requireAuth, requirePermission, requireTenant } from "../../http/auth-middleware.js";
import { SkillService } from "./skill.service.js";
import { skillSourceSchema } from "./skill-schemas.js";

const idParams = z.object({ skillId: z.string().uuid() });
const listQuery = z.object({ scope: z.enum(["available", "mine"]).default("available"), modality: z.enum(["text", "image", "video"]).optional(), q: z.string().trim().max(100).optional() });
const draftBody = z.object({ source: skillSourceSchema, expectedRevision: z.number().int().nonnegative().optional() });

function context(request: FastifyRequest) {
  if (!request.ctx.tenantId || !request.ctx.userId) throw new Error("TENANT_REQUIRED");
  return { tenantId: request.ctx.tenantId, userId: request.ctx.userId };
}

function replyError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  const status = error instanceof ZodError ? 400 : error instanceof Error && error.message === "SKILL_NOT_FOUND" ? 404 : error instanceof Error && error.message === "SKILL_VERSION_CONFLICT" ? 409 : 500;
  const code = error instanceof ZodError ? "VALIDATION_ERROR" : error instanceof Error ? error.message : "INTERNAL_ERROR";
  return reply.code(status).send({ error: { code, message: status === 500 ? "Skill service is temporarily unavailable." : code, requestId: request.ctx.requestId } });
}

export function registerSkillRoutes(app: FastifyInstance, service: SkillService): void {
  const auth = [requireAuth, requireTenant, requirePermission("flow:read")];
  app.get("/api/v2/agent/skills", { preHandler: auth }, async (request, reply) => {
    try {
      const query = listQuery.parse(request.query);
      return reply.send(await service.list(context(request), query.scope, query));
    } catch (error) { return replyError(request, reply, error); }
  });
  app.post("/api/v2/agent/skills/drafts", { preHandler: auth }, async (request, reply) => {
    try { return reply.code(201).send(await service.createDraft(context(request), draftBody.parse(request.body).source)); }
    catch (error) { return replyError(request, reply, error); }
  });
  app.get("/api/v2/agent/skills/:skillId", { preHandler: auth }, async (request, reply) => {
    try { return reply.send(await service.getDraft(context(request), idParams.parse(request.params).skillId)); }
    catch (error) { return replyError(request, reply, error); }
  });
  app.patch("/api/v2/agent/skills/:skillId/draft", { preHandler: auth }, async (request, reply) => {
    try {
      const params = idParams.parse(request.params);
      const body = draftBody.parse(request.body);
      return reply.send(await service.updateDraft(context(request), params.skillId, body.source, body.expectedRevision ?? 0));
    } catch (error) { return replyError(request, reply, error); }
  });
  app.post("/api/v2/agent/skills/:skillId/publish", { preHandler: [...auth, requirePermission("flow:update")] }, async (request, reply) => {
    try {
      const params = idParams.parse(request.params);
      const body = draftBody.parse(request.body);
      return reply.send(await service.publish(context(request), params.skillId, body.source));
    } catch (error) { return replyError(request, reply, error); }
  });
}
