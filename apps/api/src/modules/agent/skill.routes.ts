import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z, ZodError } from "zod";

import { requireAuth, requirePermission, requireTenant } from "../../http/auth-middleware.js";
import { SkillService } from "./skill.service.js";
import { skillSourceSchema } from "./skill-schemas.js";
import { SkillAuthoringService } from "./skill-authoring.service.js";
import { skillPackageSchema, validateSkillPackage } from "./skill-package.service.js";

const idParams = z.object({ skillId: z.string().uuid() });
const listQuery = z.object({ scope: z.enum(["available", "mine"]).default("available"), modality: z.enum(["text", "image", "video"]).optional(), q: z.string().trim().max(100).optional() });
const draftBody = z.object({ source: skillSourceSchema, expectedRevision: z.number().int().nonnegative().optional() });
const packageBody = skillPackageSchema;
const authoringBody = z.object({
  canvasSnapshot: z.object({
    nodes: z.array(z.object({ id: z.string().trim().min(1).max(120), kind: z.string().trim().max(40).optional(), text: z.string().max(240).optional(), title: z.string().max(120).optional() }).strict()).max(24),
    selectedNodeIds: z.array(z.string().trim().min(1).max(120)).max(12),
  }).strict().optional(),
  draft: skillSourceSchema.partial().default({}),
  sessionId: z.string().uuid().nullable().optional(),
  userMessage: z.string().trim().min(1).max(4000),
}).strict();
const instantiateBody = z.object({ inputs: z.record(z.string().trim().min(1).max(100), z.union([z.string().trim().max(12000), z.number().finite(), z.boolean()])).default({}) }).strict();

function context(request: FastifyRequest) {
  if (!request.ctx.tenantId || !request.ctx.userId) throw new Error("TENANT_REQUIRED");
  return { tenantId: request.ctx.tenantId, userId: request.ctx.userId };
}

function replyError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  const code = error instanceof ZodError ? "SKILL_INVALID_SOURCE" : error instanceof Error ? error.message : "INTERNAL_ERROR";
  const status = new Set(["SKILL_NOT_FOUND"]).has(code) ? 404 : code === "SKILL_FORBIDDEN" ? 403 : code === "SKILL_VERSION_CONFLICT" ? 409 : new Set(["SKILL_INVALID_SOURCE", "SKILL_INVALID_PACKAGE_PATH", "SKILL_INVALID_PACKAGE_FILE", "SKILL_INVALID_PACKAGE_CONTENT", "SKILL_PUBLISH_BLOCKED", "SKILL_EXPORT_UNAVAILABLE", "AUTHORING_OUTPUT_INVALID"]).has(code) ? 422 : code === "FEATURE_DISABLED" ? 404 : 500;
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
      return reply.send(await service.publish(context(request), params.skillId, body.source, body.expectedRevision));
    } catch (error) { return replyError(request, reply, error); }
  });
  app.post("/api/v2/agent/skills/authoring/turn", { preHandler: auth }, async (request, reply) => {
    try {
      ensureAuthoring();
      const body = authoringBody.parse(request.body);
      return reply.send(await authoring.turn({ ...body, runtimeContext: context(request) }));
    }
    catch (error) { return replyError(request, reply, error); }
  });
  app.post("/api/v2/agent/skills/import", { preHandler: auth }, async (request, reply) => {
    try { ensureSkills(); const pkg = validateSkillPackage(packageBody.parse(request.body)); return reply.code(201).send(await service.importPackage(context(request), pkg)); }
    catch (error) { return replyError(request, reply, error); }
  });
  app.get("/api/v2/agent/skills/:skillId/export", { preHandler: auth }, async (request, reply) => {
    try { ensureSkills(); return reply.send(await service.exportPackage(context(request), idParams.parse(request.params).skillId)); }
    catch (error) { return replyError(request, reply, error); }
  });
  app.post("/api/v2/agent/skills/:skillId/instantiate", { preHandler: [...auth, requirePermission("flow:update")] }, async (request, reply) => {
    try {
      ensureSkills();
      const params = idParams.parse(request.params);
      return reply.send(await service.instantiateGraph(context(request), params.skillId, instantiateBody.parse(request.body).inputs));
    } catch (error) { return replyError(request, reply, error); }
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
