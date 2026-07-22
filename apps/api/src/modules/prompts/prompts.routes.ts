import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import { requireAuth, requirePermission, requireTenant } from "../../http/auth-middleware.js";
import {
  type PromptAdminInput,
  type PromptIdParams,
  type PromptImportInput,
  type PromptInteractionInput,
  type PromptListQuery,
  type PromptMediaAssetParams,
  type PromptMediaOrderInput,
  type PromptMediaParams,
  type PromptMediaVariantQuery,
  type PromptReorderInput,
  type PromptStatusInput,
  promptAdminInputSchema,
  promptIdParamsSchema,
  promptImportSchema,
  promptInteractionSchema,
  promptListQuerySchema,
  promptMediaAssetParamsSchema,
  promptMediaOrderSchema,
  promptMediaParamsSchema,
  promptMediaVariantQuerySchema,
  promptReorderSchema,
  promptStatusSchema,
} from "./prompts.schemas.js";
import { PromptApiError, type PromptContext } from "./prompts.service.js";

function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return reply.code(statusCode).send({
    error: { code, details, message, requestId: request.ctx.requestId },
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

function getPromptContext(request: FastifyRequest): PromptContext {
  if (!request.ctx.tenantId) {
    throw new PromptApiError(400, "TENANT_REQUIRED", "当前请求缺少工作区上下文");
  }
  if (!request.ctx.userId) {
    throw new PromptApiError(401, "UNAUTHORIZED", "请先登录后再继续操作");
  }
  return { tenantId: request.ctx.tenantId, userId: request.ctx.userId };
}

function handleRouteError(error: unknown, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  if (error instanceof ZodError) {
    return sendError(request, reply, 400, "VALIDATION_ERROR", "请求参数无效", error.issues);
  }
  if (error instanceof PromptApiError) {
    return sendError(request, reply, error.statusCode, error.code, error.message, error.details);
  }
  request.log.error({ err: error }, "prompt plaza route failed");
  return sendError(request, reply, 500, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试。");
}

export function registerPromptRoutes(app: FastifyInstance): void {
  const readHandlers = [requireAuth, requireTenant, requirePermission("prompt:read")];
  const favoriteHandlers = [requireAuth, requireTenant, requirePermission("prompt:favorite")];
  const adminHandlers = [requireAuth, requireTenant, requirePermission("admin:system")];
  app.addContentTypeParser("application/x-prompt-media", { bodyLimit: 10 * 1024 * 1024, parseAs: "buffer" }, (_request, body, done) => done(null, body));

  app.get(
    "/api/v2/prompts",
    { preHandler: readHandlers },
    async (request, reply) => {
      try {
        const query = parseQuery<PromptListQuery>(request, promptListQuerySchema);
        return reply.send(await app.promptsService.listPrompts(getPromptContext(request), query));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/admin/prompts/:promptId/media/:mediaId/bytes",
    { preHandler: adminHandlers },
    async (request, reply) => {
      try {
        const params = parseParams<PromptMediaParams>(request, promptMediaParamsSchema);
        const query = parseQuery<PromptMediaVariantQuery>(request, promptMediaVariantQuerySchema);
        const result = await app.promptsService.getLocalMediaBytes(getPromptContext(request), params.mediaId, params.promptId, query.variant);
        if (request.headers["if-none-match"] === result.etag) return reply.code(304).send();
        reply.header("cache-control", "private, max-age=31536000, immutable");
        reply.header("content-length", result.body.byteLength);
        reply.header("content-type", result.mimeType);
        reply.header("etag", result.etag);
        reply.header("vary", "Authorization");
        return reply.send(result.body);
      } catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.get(
    "/api/v2/prompts/:promptId",
    { preHandler: readHandlers },
    async (request, reply) => {
      try {
        const params = parseParams<PromptIdParams>(request, promptIdParamsSchema);
        return reply.send(await app.promptsService.getPrompt(getPromptContext(request), params.promptId));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/prompts/media/:mediaId/bytes",
    { preHandler: readHandlers },
    async (request, reply) => {
      try {
        const params = parseParams<{ mediaId: string }>(request, promptMediaParamsSchema.pick({ mediaId: true }));
        const query = parseQuery<PromptMediaVariantQuery>(request, promptMediaVariantQuerySchema);
        const result = await app.promptsService.getLocalMediaBytes(getPromptContext(request), params.mediaId, undefined, query.variant);
        if (request.headers["if-none-match"] === result.etag) return reply.code(304).send();
        reply.header("cache-control", "private, max-age=31536000, immutable");
        reply.header("content-length", result.body.byteLength);
        reply.header("content-type", result.mimeType);
        reply.header("etag", result.etag);
        reply.header("vary", "Authorization");
        return reply.send(result.body);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/prompts/:promptId/media",
    { preHandler: adminHandlers },
    async (request, reply) => {
      try {
        const params = parseParams<PromptIdParams>(request, promptIdParamsSchema);
        if (!(request.body instanceof Buffer)) throw new PromptApiError(400, "PROMPT_MEDIA_BODY_INVALID", "效果图上传内容无效");
        const filename = String(request.headers["x-prompt-media-filename"] ?? "").trim();
        const mimeType = String(request.headers["x-prompt-media-content-type"] ?? "").trim();
        const width = Number(request.headers["x-prompt-media-width"] ?? 0) || null;
        const height = Number(request.headers["x-prompt-media-height"] ?? 0) || null;
        const result = await app.promptsService.uploadLocalMedia(getPromptContext(request), params.promptId, { body: request.body, height, mimeType, originalFilename: filename || "prompt-media", width });
        return reply.code(201).send(result);
      } catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.get(
    "/api/v2/admin/prompts/:promptId/media",
    { preHandler: adminHandlers },
    async (request, reply) => {
      try { const params = parseParams<PromptIdParams>(request, promptIdParamsSchema); return reply.send(await app.promptsService.listLocalMedia(getPromptContext(request), params.promptId)); }
      catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.patch(
    "/api/v2/admin/prompts/:promptId/media",
    { preHandler: adminHandlers },
    async (request, reply) => {
      try { const params = parseParams<PromptIdParams>(request, promptIdParamsSchema); const body = parseBody<PromptMediaOrderInput>(request, promptMediaOrderSchema); return reply.send(await app.promptsService.updateLocalMediaOrder(getPromptContext(request), params.promptId, body.media)); }
      catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.delete(
    "/api/v2/admin/prompts/:promptId/media/:mediaId",
    { preHandler: adminHandlers },
    async (request, reply) => {
      try { const params = parseParams<PromptMediaParams>(request, promptMediaParamsSchema); return reply.send(await app.promptsService.deleteLocalMedia(getPromptContext(request), params.promptId, params.mediaId)); }
      catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.post(
    "/api/v2/prompts/:promptId/favorite",
    { preHandler: favoriteHandlers },
    async (request, reply) => {
      try {
        const params = parseParams<PromptIdParams>(request, promptIdParamsSchema);
        return reply.send(await app.promptsService.setFavorite(getPromptContext(request), params.promptId, true));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.delete(
    "/api/v2/prompts/:promptId/favorite",
    { preHandler: favoriteHandlers },
    async (request, reply) => {
      try {
        const params = parseParams<PromptIdParams>(request, promptIdParamsSchema);
        return reply.send(await app.promptsService.setFavorite(getPromptContext(request), params.promptId, false));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/prompts/:promptId/interactions",
    { preHandler: readHandlers },
    async (request, reply) => {
      try {
        const params = parseParams<PromptIdParams>(request, promptIdParamsSchema);
        const body = parseBody<PromptInteractionInput>(request, promptInteractionSchema);
        return reply.code(201).send(await app.promptsService.recordInteraction(getPromptContext(request), params.promptId, body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/admin/prompts",
    { preHandler: adminHandlers },
    async (request, reply) => {
      try {
        return reply.send(await app.promptsService.listAdminPrompts(getPromptContext(request)));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/prompts",
    { preHandler: adminHandlers },
    async (request, reply) => {
      try {
        const body = parseBody<PromptAdminInput>(request, promptAdminInputSchema);
        return reply.code(201).send(await app.promptsService.createAdminPrompt(getPromptContext(request), body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.patch(
    "/api/v2/admin/prompts/order",
    { preHandler: adminHandlers },
    async (request, reply) => {
      try {
        const body = parseBody<PromptReorderInput>(request, promptReorderSchema);
        return reply.send(await app.promptsService.reorderAdminPrompts(getPromptContext(request), body.promptIds));
      } catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.delete(
    "/api/v2/admin/prompts/:promptId",
    { preHandler: adminHandlers },
    async (request, reply) => {
      try {
        const params = parseParams<PromptIdParams>(request, promptIdParamsSchema);
        return reply.send(await app.promptsService.deleteAdminPrompt(getPromptContext(request), params.promptId));
      } catch (error) { return handleRouteError(error, request, reply); }
    },
  );

  app.patch(
    "/api/v2/admin/prompts/:promptId",
    { preHandler: adminHandlers },
    async (request, reply) => {
      try {
        const params = parseParams<PromptIdParams>(request, promptIdParamsSchema);
        const body = parseBody<PromptAdminInput>(request, promptAdminInputSchema);
        return reply.send(await app.promptsService.updateAdminPrompt(getPromptContext(request), params.promptId, body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/prompts/:promptId/status",
    { preHandler: adminHandlers },
    async (request, reply) => {
      try {
        const params = parseParams<PromptIdParams>(request, promptIdParamsSchema);
        const body = parseBody<PromptStatusInput>(request, promptStatusSchema);
        return reply.send(await app.promptsService.setAdminStatus(getPromptContext(request), params.promptId, body.status));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/prompts/import/validate",
    { preHandler: adminHandlers },
    async (request, reply) => {
      try {
        const body = parseBody<PromptImportInput>(request, promptImportSchema);
        return reply.send(app.promptsService.validateImport(body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/admin/prompts/import",
    { preHandler: adminHandlers },
    async (request, reply) => {
      try {
        const body = parseBody<PromptImportInput>(request, promptImportSchema);
        return reply.code(201).send(await app.promptsService.importAdminPrompts(getPromptContext(request), body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );
}
