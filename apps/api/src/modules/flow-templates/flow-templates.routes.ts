import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { requireAuth, requirePermission, requireTenant } from '../../http/auth-middleware.js';
import {
  type FlowTemplateIdParams,
  type FlowTemplateListQuery,
  type InstantiateFlowTemplateInput,
  flowTemplateIdParamsSchema,
  flowTemplateListQuerySchema,
  instantiateFlowTemplateSchema,
} from './flow-templates.schemas.js';
import { FlowTemplatesApiError } from './flow-templates.service.js';

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

function getTemplateContext(request: FastifyRequest) {
  if (!request.ctx.tenantId) {
    throw new FlowTemplatesApiError(400, 'TENANT_REQUIRED', '当前请求缺少工作区上下文');
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

  if (error instanceof FlowTemplatesApiError) {
    return sendError(request, reply, error.statusCode, error.code, error.message);
  }

  request.log.error({ err: error }, 'flow templates route failed');
  return sendError(request, reply, 500, 'INTERNAL_ERROR', '服务暂时不可用，请稍后重试。');
}

export function registerFlowTemplateRoutes(app: FastifyInstance): void {
  const readHandlers = [requireAuth, requireTenant, requirePermission('flow:read')];

  app.get(
    '/api/v2/flow-templates',
    {
      preHandler: readHandlers,
    },
    async (request, reply) => {
      try {
        const query = parseQuery<FlowTemplateListQuery>(request, flowTemplateListQuerySchema);
        return reply.send(await app.flowTemplatesService.listTemplates(getTemplateContext(request), query));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    '/api/v2/flow-templates/:templateId',
    {
      preHandler: readHandlers,
    },
    async (request, reply) => {
      try {
        const params = parseParams<FlowTemplateIdParams>(request, flowTemplateIdParamsSchema);
        return reply.send(await app.flowTemplatesService.getTemplateGraph(getTemplateContext(request), params.templateId));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    '/api/v2/flow-templates/:templateId/usage',
    {
      preHandler: [requireAuth, requireTenant, requirePermission('flow:update')],
    },
    async (request, reply) => {
      try {
        const params = parseParams<FlowTemplateIdParams>(request, flowTemplateIdParamsSchema);
        const body = parseBody<InstantiateFlowTemplateInput>(request, instantiateFlowTemplateSchema);
        return reply.code(201).send(
          await app.flowTemplatesService.recordUsage(getTemplateContext(request), params.templateId, body.projectId),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );
}
