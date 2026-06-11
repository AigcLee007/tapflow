import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import {
  requireAuth,
  requirePermission,
  requireTenant,
} from "../../http/auth-middleware.js";
import {
  type AssetIdParams,
  type AssetDownloadUrlQuery,
  type AssetListQuery,
  type CompleteUploadInput,
  type CreateAssetFolderInput,
  type FolderAssetParams,
  type FolderIdParams,
  type PresignedUploadInput,
  type SignedAssetUrlRequest,
  type UpdateAssetFolderInput,
  type UpdateAssetMetadataInput,
  assetIdParamsSchema,
  assetDownloadUrlQuerySchema,
  assetListQuerySchema,
  completeUploadSchema,
  createAssetFolderSchema,
  folderAssetParamsSchema,
  folderIdParamsSchema,
  presignedUploadSchema,
  signedAssetUrlRequestSchema,
  updateAssetFolderSchema,
  updateAssetMetadataSchema,
} from "./assets.schemas.js";
import { AssetsApiError } from "./assets.service.js";

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

function getAssetContext(request: FastifyRequest) {
  if (!request.ctx.tenantId) {
    throw new AssetsApiError(400, "TENANT_REQUIRED", "当前请求缺少工作区上下文");
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

  if (error instanceof AssetsApiError) {
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
    "assets route failed",
  );
  return sendError(request, reply, 500, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试。");
}

export function registerAssetRoutes(app: FastifyInstance): void {
  const authHandlers = [requireAuth, requireTenant];
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );

  app.get(
    "/api/v2/assets",
    {
      preHandler: [...authHandlers, requirePermission("asset:read")],
    },
    async (request, reply) => {
      try {
        const query = parseQuery<AssetListQuery>(request, assetListQuerySchema);
        const result = await app.assetsService.listAssets(getAssetContext(request), query);
        return reply.send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/assets/folders",
    {
      preHandler: [...authHandlers, requirePermission("asset:read")],
    },
    async (request, reply) => {
      try {
        const result = await app.assetsService.listFolders(getAssetContext(request));
        return reply.send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/assets/folders",
    {
      preHandler: [...authHandlers, requirePermission("asset:create")],
    },
    async (request, reply) => {
      try {
        const body = parseBody<CreateAssetFolderInput>(request, createAssetFolderSchema);
        const result = await app.assetsService.createFolder(getAssetContext(request), body);
        return reply.code(201).send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.patch(
    "/api/v2/assets/folders/:folderId",
    {
      preHandler: [...authHandlers, requirePermission("asset:update")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<FolderIdParams>(request, folderIdParamsSchema);
        const body = parseBody<UpdateAssetFolderInput>(request, updateAssetFolderSchema);
        const result = await app.assetsService.updateFolder(
          getAssetContext(request),
          params.folderId,
          body,
        );
        return reply.send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.delete(
    "/api/v2/assets/folders/:folderId",
    {
      preHandler: [...authHandlers, requirePermission("asset:delete")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<FolderIdParams>(request, folderIdParamsSchema);
        const result = await app.assetsService.deleteFolder(getAssetContext(request), params.folderId);
        return reply.send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/assets/folders/:folderId/items",
    {
      preHandler: [...authHandlers, requirePermission("asset:create")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<FolderIdParams>(request, folderIdParamsSchema);
        const body = parseBody<AssetIdParams>(request, assetIdParamsSchema);
        const result = await app.assetsService.addAssetToFolder(
          getAssetContext(request),
          params.folderId,
          body.assetId,
        );
        return reply.code(201).send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.delete(
    "/api/v2/assets/folders/:folderId/items/:assetId",
    {
      preHandler: [...authHandlers, requirePermission("asset:delete")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<FolderAssetParams>(request, folderAssetParamsSchema);
        const result = await app.assetsService.removeAssetFromFolder(
          getAssetContext(request),
          params.folderId,
          params.assetId,
        );
        return reply.send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/assets/signed-urls",
    {
      preHandler: [...authHandlers, requirePermission("asset:read")],
    },
    async (request, reply) => {
      try {
        const body = parseBody<SignedAssetUrlRequest>(request, signedAssetUrlRequestSchema);
        const result = await app.assetsService.createSignedUrls(getAssetContext(request), body.requests);
        return reply.send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/assets/presigned-upload",
    {
      preHandler: [...authHandlers, requirePermission("asset:create")],
    },
    async (request, reply) => {
      try {
        const body = parseBody<PresignedUploadInput>(request, presignedUploadSchema);
        const result = await app.assetsService.createPresignedUpload(getAssetContext(request), body);
        return reply.code(201).send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/assets/:assetId/complete-upload",
    {
      preHandler: [...authHandlers, requirePermission("asset:create")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AssetIdParams>(request, assetIdParamsSchema);
        const body = parseBody<CompleteUploadInput>(request, completeUploadSchema);
        const result = await app.assetsService.completeUpload(
          getAssetContext(request),
          params.assetId,
          body,
        );
        return reply.send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/assets/:assetId/upload-bytes",
    {
      preHandler: [...authHandlers, requirePermission("asset:create")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AssetIdParams>(request, assetIdParamsSchema);
        const rawBody = request.body;
        if (!(rawBody instanceof Buffer)) {
          return sendError(request, reply, 400, "INVALID_UPLOAD_BODY", "Upload body must be binary data");
        }

        const contentTypeHeader = request.headers["x-asset-upload-content-type"];
        const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader;

        await app.assetsService.uploadAssetBytes(getAssetContext(request), params.assetId, {
          body: rawBody,
          contentType,
        });
        return reply.code(204).send();
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/assets/:assetId",
    {
      preHandler: [...authHandlers, requirePermission("asset:read")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AssetIdParams>(request, assetIdParamsSchema);
        const result = await app.assetsService.getAsset(getAssetContext(request), params.assetId);
        return reply.send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.patch(
    "/api/v2/assets/:assetId/metadata",
    {
      preHandler: [...authHandlers, requirePermission("asset:update")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AssetIdParams>(request, assetIdParamsSchema);
        const body = parseBody<UpdateAssetMetadataInput>(request, updateAssetMetadataSchema);
        const result = await app.assetsService.updateAssetMetadata(
          getAssetContext(request),
          params.assetId,
          body,
        );
        return reply.send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/assets/:assetId/download-url",
    {
      preHandler: [...authHandlers, requirePermission("asset:read")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AssetIdParams>(request, assetIdParamsSchema);
        const query = parseQuery<AssetDownloadUrlQuery>(request, assetDownloadUrlQuerySchema);
        const result = await app.assetsService.createDownloadUrl(
          getAssetContext(request),
          params.assetId,
          query.variantKey,
        );
        return reply.send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.delete(
    "/api/v2/assets/:assetId",
    {
      preHandler: [...authHandlers, requirePermission("asset:delete")],
    },
    async (request, reply) => {
      try {
        const params = parseParams<AssetIdParams>(request, assetIdParamsSchema);
        const result = await app.assetsService.deleteAsset(getAssetContext(request), params.assetId);
        return reply.send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );
}
