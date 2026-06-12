import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { requireAuth, requirePermission, requireTenant } from '../../http/auth-middleware.js';
import {
  type CreateFlowHistorySnapshotInput,
  type FlowHistoryRestoreParams,
  type ProjectHistoryParams,
  createFlowHistorySnapshotSchema,
  flowHistoryRestoreParamsSchema,
  projectHistoryParamsSchema,
} from './flow-history.schemas.js';
import { FlowHistoryApiError } from './flow-history.service.js';

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

function getHistoryContext(request: FastifyRequest) {
  if (!request.ctx.tenantId) {
    throw new FlowHistoryApiError(400, 'TENANT_REQUIRED', '当前请求缺少工作区上下文');
  }

  return {
    tenantId: request.ctx.tenantId,
    userId: request.ctx.userId,
  };
}

function handleRouteError(error: unknown, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  if (error instanceof ZodError) {
    return sendError(request, reply, 400, 'VALIDATION_ERROR', 'Request validation failed', error.issues);
  }

  if (error instanceof FlowHistoryApiError) {
    return sendError(request, reply, error.statusCode, error.code, error.message);
  }

  request.log.error({ err: error }, 'flow history route failed');
  return sendError(request, reply, 500, 'INTERNAL_ERROR', '服务暂时不可用，请稍后重试。');
}

export function registerFlowHistoryRoutes(app: FastifyInstance): void {
  const authHandlers = [requireAuth, requireTenant];

  app.get(
    '/api/v2/projects/:projectId/history',
    {
      preHandler: [...authHandlers, requirePermission('flow:read')],
    },
    async (request, reply) => {
      try {
        const params = parseParams<ProjectHistoryParams>(request, projectHistoryParamsSchema);
        return reply.send(await app.flowHistoryService.listHistory(getHistoryContext(request), params.projectId));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    '/api/v2/projects/:projectId/history/snapshot',
    {
      preHandler: [...authHandlers, requirePermission('flow:update')],
    },
    async (request, reply) => {
      try {
        const params = parseParams<ProjectHistoryParams>(request, projectHistoryParamsSchema);
        const body = parseBody<CreateFlowHistorySnapshotInput>(request, createFlowHistorySnapshotSchema);
        return reply.code(201).send(await app.flowHistoryService.createSnapshot(getHistoryContext(request), params.projectId, body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    '/api/v2/projects/:projectId/history/:versionId/restore',
    {
      preHandler: [...authHandlers, requirePermission('flow:update')],
    },
    async (request, reply) => {
      try {
        const params = parseParams<FlowHistoryRestoreParams>(request, flowHistoryRestoreParamsSchema);
        return reply.send(await app.flowHistoryService.restoreVersion(getHistoryContext(request), params.projectId, params.versionId));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );
}
