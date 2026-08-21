import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z, ZodError } from "zod";

import { requireAuth, requirePermission, requireTenant } from "../../http/auth-middleware.js";
import { type SkillRunService } from "./agent-skill-run.service.js";
import { initializeSkillRun } from "./skill-run-initializer.js";
import type { AgentCanvasService } from "./agent-canvas.service.js";
import { assertSkillResultPlacement } from "./skill-result-placement.js";
import { type SkillService } from "./skill.service.js";

const runIdParams = z.object({ runId: z.string().uuid() });
const eventsQuery = z.object({ afterSeq: z.coerce.number().int().nonnegative().default(0) });
const createRunBody = z.object({
  flowId: z.string().uuid().nullable().optional(),
  graphRevision: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string().trim().min(1).max(200),
  projectId: z.string().uuid().nullable().optional(),
  sessionId: z.string().uuid().nullable().optional(),
  skillId: z.string().uuid(),
  skillVersion: z.number().int().positive().optional(),
  turnId: z.string().uuid().nullable().optional(),
  waitingForInput: z.boolean().optional(),
}).strict();
const cancelBody = z.object({ reason: z.string().trim().min(1).max(500).optional() }).strict();
const placeResultsBody = z.object({
  expectedRevision: z.number().int().nonnegative(),
  flowId: z.string().uuid(),
  results: z.array(z.object({
    assetId: z.string().trim().min(1).max(200).optional(),
    kind: z.enum(["text", "image", "video"]),
    text: z.string().trim().max(20_000).optional(),
    title: z.string().trim().max(200).optional(),
  }).strict()).min(1).max(12),
  sessionId: z.string().uuid(),
  turnId: z.string().uuid(),
}).strict();

function context(request: FastifyRequest) {
  if (!request.ctx.tenantId || !request.ctx.userId) throw new Error("TENANT_REQUIRED");
  return { tenantId: request.ctx.tenantId, userId: request.ctx.userId };
}

function replyError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const status = error instanceof ZodError ? 400
    : ["FEATURE_DISABLED", "SKILL_NOT_FOUND", "SKILL_RUN_NOT_FOUND"].includes(message) ? 404
      : ["SKILL_RUN_STALE_APPROVAL", "SKILL_RUN_STALE_TRANSITION", "SKILL_RUN_ALREADY_TERMINAL", "SKILL_RUN_INVALID_APPROVAL", "SKILL_RUN_APPROVAL_REQUIRED", "SKILL_RUN_INVALID_TRANSITION", "SKILL_STEP_INVALID_TRANSITION", "SKILL_RESULT_NOT_READY", "SKILL_RESULT_CONTEXT_MISMATCH", "FLOW_DRAFT_REVISION_CONFLICT"].includes(message) ? 409
        : 500;
  return reply.code(status).send({ error: { code: error instanceof ZodError ? "VALIDATION_ERROR" : message, message: status >= 500 ? "Skill run service is temporarily unavailable." : message, requestId: request.ctx.requestId } });
}

export function registerSkillRunRoutes(app: FastifyInstance, options: { canvas: Pick<AgentCanvasService, "placeSkillResults">; skills: Pick<SkillService, "getPublishedVersion" | "getPublishedVersionByNumber">; runs: SkillRunService; enabled: boolean }): void {
  const auth = [requireAuth, requireTenant];
  const ensureEnabled = () => { if (!options.enabled) throw new Error("FEATURE_DISABLED"); };
  app.post("/api/v2/agent/skill-runs", { preHandler: [...auth, requirePermission("flow:read")] }, async (request, reply) => {
    try {
      ensureEnabled();
      const body = createRunBody.parse(request.body);
      const ctx = context(request);
      const version = body.skillVersion === undefined
        ? await options.skills.getPublishedVersion(ctx, body.skillId)
        : await options.skills.getPublishedVersionByNumber(ctx, body.skillId, body.skillVersion);
      const created = await options.runs.createRun({ ...ctx, ...body, skillVersionId: version.id });
      const next = await initializeSkillRun(options.runs, ctx, created.id, created.created, body.waitingForInput === true);
      return reply.code(created.created ? 201 : 200).send(next);
    } catch (error) { return replyError(request, reply, error); }
  });
  app.get("/api/v2/agent/skill-runs/:runId", { preHandler: [...auth, requirePermission("flow:read")] }, async (request, reply) => {
    try {
      ensureEnabled();
      const run = await options.runs.getRun(context(request), runIdParams.parse(request.params).runId);
      if (!run) throw new Error("SKILL_RUN_NOT_FOUND");
      return reply.send(run);
    } catch (error) { return replyError(request, reply, error); }
  });
  app.get("/api/v2/agent/skill-runs/:runId/events", { preHandler: [...auth, requirePermission("flow:read")] }, async (request, reply) => {
    try {
      ensureEnabled();
      const params = runIdParams.parse(request.params);
      const query = eventsQuery.parse(request.query);
      const run = await options.runs.getRun(context(request), params.runId);
      if (!run) throw new Error("SKILL_RUN_NOT_FOUND");
      return reply.send({ events: await options.runs.listEvents(context(request), params.runId, query.afterSeq), runId: params.runId });
    } catch (error) { return replyError(request, reply, error); }
  });
  app.post("/api/v2/agent/skill-runs/:runId/approve", { preHandler: [...auth, requirePermission("flow:run")] }, async (request, reply) => {
    try { ensureEnabled(); return reply.send(await options.runs.approve(context(request), runIdParams.parse(request.params).runId)); }
    catch (error) { return replyError(request, reply, error); }
  });
  app.post("/api/v2/agent/skill-runs/:runId/cancel", { preHandler: [...auth, requirePermission("flow:run")] }, async (request, reply) => {
    try { ensureEnabled(); const body = cancelBody.parse(request.body); return reply.send(await options.runs.cancel(context(request), runIdParams.parse(request.params).runId, body.reason)); }
    catch (error) { return replyError(request, reply, error); }
  });
  app.post("/api/v2/agent/skill-runs/:runId/place-results", { preHandler: [...auth, requirePermission("flow:update")] }, async (request, reply) => {
    try {
      ensureEnabled();
      const runId = runIdParams.parse(request.params).runId;
      const body = placeResultsBody.parse(request.body);
      const ctx = context(request);
      const run = await options.runs.getRun(ctx, runId);
      if (!run) throw new Error("SKILL_RUN_NOT_FOUND");
      assertSkillResultPlacement({ input: body, run });
      return reply.send(await options.canvas.placeSkillResults(ctx, body.sessionId, {
        expectedRevision: body.expectedRevision,
        flowId: body.flowId,
        results: body.results,
        skillRunId: runId,
        turnId: body.turnId,
      }));
    } catch (error) { return replyError(request, reply, error); }
  });
}
