import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { requireAuth, requirePermission, requireTenant } from '../../http/auth-middleware.js';
import {
  type FlowTemplateIdParams,
  type FlowTemplateAdminListQuery,
  type FlowTemplateListQuery,
  type InstantiateFlowTemplateInput,
  type SaveFlowTemplateDraftInput,
  flowTemplateAdminListQuerySchema,
  flowTemplateIdParamsSchema,
  flowTemplateListQuerySchema,
  instantiateFlowTemplateSchema,
  saveFlowTemplateDraftSchema,
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
  const adminHandlers = [requireAuth, requireTenant, requirePermission('admin:system')];

  app.get('/api/v2/admin/flow-templates', { preHandler: adminHandlers }, async (request, reply) => {
    try {
      return reply.send(await app.flowTemplatesService.listAdminTemplates(
        getTemplateContext(request) as { tenantId: string; userId: string },
        parseQuery<FlowTemplateAdminListQuery>(request, flowTemplateAdminListQuerySchema),
      ));
    } catch (error) { return handleRouteError(error, request, reply); }
  });

  app.post('/api/v2/admin/flow-templates', { preHandler: adminHandlers }, async (request, reply) => {
    try {
      return reply.code(201).send(await app.flowTemplatesService.createDraft(
        getTemplateContext(request) as { tenantId: string; userId: string },
        parseBody<SaveFlowTemplateDraftInput>(request, saveFlowTemplateDraftSchema),
      ));
    } catch (error) { return handleRouteError(error, request, reply); }
  });

  app.get('/api/v2/admin/flow-templates/:templateId', { preHandler: adminHandlers }, async (request, reply) => {
    try {
      return reply.send(await app.flowTemplatesService.getAdminTemplate(
        getTemplateContext(request) as { tenantId: string; userId: string },
        parseParams<FlowTemplateIdParams>(request, flowTemplateIdParamsSchema).templateId,
      ));
    } catch (error) { return handleRouteError(error, request, reply); }
  });

  app.put('/api/v2/admin/flow-templates/:templateId', { preHandler: adminHandlers }, async (request, reply) => {
    try {
      return reply.send(await app.flowTemplatesService.updateDraft(
        getTemplateContext(request) as { tenantId: string; userId: string },
        parseParams<FlowTemplateIdParams>(request, flowTemplateIdParamsSchema).templateId,
        parseBody<SaveFlowTemplateDraftInput>(request, saveFlowTemplateDraftSchema),
      ));
    } catch (error) { return handleRouteError(error, request, reply); }
  });

  for (const [suffix, action] of [
    ['testing', 'markTesting'], ['publish', 'publish'], ['archive', 'archive'],
  ] as const) {
    app.post(`/api/v2/admin/flow-templates/:templateId/${suffix}`, { preHandler: adminHandlers }, async (request, reply) => {
      try {
        const context = getTemplateContext(request) as { tenantId: string; userId: string };
        const templateId = parseParams<FlowTemplateIdParams>(request, flowTemplateIdParamsSchema).templateId;
        return reply.send(await app.flowTemplatesService[action](context, templateId));
      } catch (error) { return handleRouteError(error, request, reply); }
    });
  }

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
