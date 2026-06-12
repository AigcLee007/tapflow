import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { requireAuth, requirePermission, requireTenant } from '../../http/auth-middleware.js';
import {
  type CreateFlowCommentInput,
  type FlowCommentIdParams,
  type ProjectCommentParams,
  type UpdateFlowCommentInput,
  createFlowCommentSchema,
  flowCommentIdParamsSchema,
  projectCommentParamsSchema,
  updateFlowCommentSchema,
} from './flow-comments.schemas.js';
import { FlowCommentsApiError } from './flow-comments.service.js';

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

function getCommentsContext(request: FastifyRequest) {
  if (!request.ctx.tenantId) {
    throw new FlowCommentsApiError(400, 'TENANT_REQUIRED', '当前请求缺少工作区上下文');
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

  if (error instanceof FlowCommentsApiError) {
    return sendError(request, reply, error.statusCode, error.code, error.message);
  }

  request.log.error({ err: error }, 'flow comments route failed');
  return sendError(request, reply, 500, 'INTERNAL_ERROR', '服务暂时不可用，请稍后重试。');
}

export function registerFlowCommentRoutes(app: FastifyInstance): void {
  const authHandlers = [requireAuth, requireTenant];

  app.get(
    '/api/v2/projects/:projectId/comments',
    {
      preHandler: [...authHandlers, requirePermission('project:read')],
    },
    async (request, reply) => {
      try {
        const params = parseParams<ProjectCommentParams>(request, projectCommentParamsSchema);
        const items = await app.flowCommentsService.listComments(getCommentsContext(request), params.projectId);
        return reply.send({ items });
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    '/api/v2/projects/:projectId/comments',
    {
      preHandler: [...authHandlers, requirePermission('project:update')],
    },
    async (request, reply) => {
      try {
        const params = parseParams<ProjectCommentParams>(request, projectCommentParamsSchema);
        const body = parseBody<CreateFlowCommentInput>(request, createFlowCommentSchema);
        const result = await app.flowCommentsService.createComment(getCommentsContext(request), params.projectId, body);
        return reply.code(201).send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.patch(
    '/api/v2/projects/:projectId/comments/:commentId',
    {
      preHandler: [...authHandlers, requirePermission('project:update')],
    },
    async (request, reply) => {
      try {
        const params = parseParams<FlowCommentIdParams>(request, flowCommentIdParamsSchema);
        const body = parseBody<UpdateFlowCommentInput>(request, updateFlowCommentSchema);
        const result = await app.flowCommentsService.updateComment(
          getCommentsContext(request),
          params.projectId,
          params.commentId,
          body,
        );
        return reply.send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );
}
