import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z, ZodError } from "zod";

import { requireAuth, requirePermission, requireTenant } from "../../http/auth-middleware.js";
import { SkillService } from "./skill.service.js";
import { skillSourceSchema } from "./skill-schemas.js";
import { SkillAuthoringService } from "./skill-authoring.service.js";

const idParams = z.object({ skillId: z.string().uuid() });
const listQuery = z.object({ scope: z.enum(["available", "mine"]).default("available"), modality: z.enum(["text", "image", "video"]).optional(), q: z.string().trim().max(100).optional() });
const draftBody = z.object({ source: skillSourceSchema, expectedRevision: z.number().int().nonnegative().optional() });
const packageBody = z.object({ skillMd: z.string().trim().min(1).max(24000), graphJson: z.unknown().optional() }).strict();
const authoringBody = z.object({ draft: skillSourceSchema.partial().default({}), userMessage: z.string().trim().min(1).max(4000) }).strict();

function context(request: FastifyRequest) {
  if (!request.ctx.tenantId || !request.ctx.userId) throw new Error("TENANT_REQUIRED");
  return { tenantId: request.ctx.tenantId, userId: request.ctx.userId };
}

function replyError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  const status = error instanceof ZodError ? 400 : error instanceof Error && ["SKILL_NOT_FOUND", "FEATURE_DISABLED"].includes(error.message) ? (error.message === "SKILL_NOT_FOUND" ? 404 : 404) : error instanceof Error && error.message === "SKILL_VERSION_CONFLICT" ? 409 : error instanceof Error && ["SKILL_EXPORT_UNAVAILABLE", "AUTHORING_OUTPUT_INVALID"].includes(error.message) ? 422 : 500;
  const code = error instanceof ZodError ? "VALIDATION_ERROR" : error instanceof Error ? error.message : "INTERNAL_ERROR";
  return reply.code(status).send({ error: { code, message: status === 500 ? "Skill service is temporarily unavailable." : code, requestId: request.ctx.requestId } });
}

export function registerSkillRoutes(app: FastifyInstance, service: SkillService, authoring = new SkillAuthoringService(), flags: { skillsEnabled?: boolean; authoringEnabled?: boolean } = {}): void {
  const auth = [requireAuth, requireTenant, requirePermission("flow:read")];
  const ensureSkills = () => { if (flags.skillsEnabled === false) throw new Error("FEATURE_DISABLED"); };
  const ensureAuthoring = () => { ensureSkills(); if (flags.authoringEnabled === false) throw new Error("FEATURE_DISABLED"); };
  app.get("/api/v2/agent/skills", { preHandler: auth }, async (request, reply) => {
    try { ensureSkills();
      const query = listQuery.parse(request.query);
      return reply.send(await service.list(context(request), query.scope, query));
    } catch (error) { return replyError(request, reply, error); }
  });
  app.post("/api/v2/agent/skills/drafts", { preHandler: auth }, async (request, reply) => {
    try { ensureSkills(); return reply.code(201).send(await service.createDraft(context(request), draftBody.parse(request.body).source)); }
    catch (error) { return replyError(request, reply, error); }
  });
  app.get("/api/v2/agent/skills/:skillId", { preHandler: auth }, async (request, reply) => {
    try { ensureSkills(); return reply.send(await service.getDraft(context(request), idParams.parse(request.params).skillId)); }
    catch (error) { return replyError(request, reply, error); }
  });
  app.patch("/api/v2/agent/skills/:skillId/draft", { preHandler: auth }, async (request, reply) => {
    try { ensureSkills();
      const params = idParams.parse(request.params);
      const body = draftBody.parse(request.body);
      return reply.send(await service.updateDraft(context(request), params.skillId, body.source, body.expectedRevision ?? 0));
    } catch (error) { return replyError(request, reply, error); }
  });
  app.post("/api/v2/agent/skills/:skillId/publish", { preHandler: [...auth, requirePermission("flow:update")] }, async (request, reply) => {
    try { ensureSkills();
      const params = idParams.parse(request.params);
      const body = draftBody.parse(request.body);
      return reply.send(await service.publish(context(request), params.skillId, body.source));
    } catch (error) { return replyError(request, reply, error); }
  });
  app.post("/api/v2/agent/skills/authoring/turn", { preHandler: auth }, async (request, reply) => {
    try { ensureAuthoring(); return reply.send(await authoring.turn(authoringBody.parse(request.body))); }
    catch (error) { return replyError(request, reply, error); }
  });
  app.post("/api/v2/agent/skills/import", { preHandler: auth }, async (request, reply) => {
    try { ensureSkills(); return reply.code(201).send(await service.importPackage(context(request), packageBody.parse(request.body))); }
    catch (error) { return replyError(request, reply, error); }
  });
  app.get("/api/v2/agent/skills/:skillId/export", { preHandler: auth }, async (request, reply) => {
    try { ensureSkills(); return reply.send(await service.exportPackage(context(request), idParams.parse(request.params).skillId)); }
    catch (error) { return replyError(request, reply, error); }
  });
  app.post("/api/v2/agent/skills/:skillId/duplicate", { preHandler: auth }, async (request, reply) => {
    try {
      ensureSkills();
      const params = idParams.parse(request.params);
      const body = draftBody.parse(request.body);
      return reply.code(201).send(await service.duplicate(context(request), params.skillId, body.source));
    } catch (error) { return replyError(request, reply, error); }
  });
}
