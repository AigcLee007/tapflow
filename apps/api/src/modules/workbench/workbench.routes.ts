import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import { requireAuth, requirePermission, requireTenant } from "../../http/auth-middleware.js";
import {
  type CreateWorkbenchGenerationInput,
  type ListWorkbenchGenerationsQuery,
  type SendWorkbenchResultToProjectInput,
  type WorkbenchGenerationIdParams,
  type WorkbenchResultIdParams,
  createWorkbenchGenerationSchema,
  listWorkbenchGenerationsQuerySchema,
  sendWorkbenchResultToProjectSchema,
  workbenchGenerationIdParamsSchema,
  workbenchResultIdParamsSchema,
} from "./workbench.schemas.js";
import { WorkbenchApiError } from "./workbench.service.js";

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

function getWorkbenchContext(request: FastifyRequest) {
  if (!request.ctx.tenantId) {
    throw new WorkbenchApiError(400, "TENANT_REQUIRED", "Current request is missing tenant context.");
  }

  return {
    tenantId: request.ctx.tenantId,
    traceId: request.ctx.traceId,
    userId: request.ctx.userId,
  };
}

function handleRouteError(error: unknown, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  if (error instanceof ZodError) {
    return sendError(request, reply, 400, "VALIDATION_ERROR", "Request validation failed", error.issues);
  }

  if (error instanceof WorkbenchApiError) {
    return sendError(request, reply, error.statusCode, error.code, error.message, error.details);
  }

  request.log.error(
    {
      err: error,
      requestId: request.ctx.requestId,
      tenantId: request.ctx.tenantId,
      traceId: request.ctx.traceId,
      userId: request.ctx.userId,
    },
    "workbench route failed",
  );
  return sendError(request, reply, 500, "INTERNAL_ERROR", "Service is temporarily unavailable");
}

export function registerWorkbenchRoutes(app: FastifyInstance): void {
  const authHandlers = [requireAuth, requireTenant];

  app.get(
    "/api/v2/workbench/generations",
    {
      preHandler: [...authHandlers, requirePermission("flow:run")],
    },
    async (request, reply) => {
      try {
        const query = listWorkbenchGenerationsQuerySchema.parse(request.query) as ListWorkbenchGenerationsQuery;
        return reply.send(await app.workbenchService.listGenerations(getWorkbenchContext(request), query));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/workbench/generations",
    {
      preHandler: [...authHandlers, requirePermission("flow:run")],
    },
    async (request, reply) => {
      try {
        const body = createWorkbenchGenerationSchema.parse(request.body) as CreateWorkbenchGenerationInput;
        const result = await app.workbenchService.createGeneration(getWorkbenchContext(request), body);
        return reply.code(201).send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/workbench/generations/:generationId",
    {
      preHandler: [...authHandlers, requirePermission("run:read")],
    },
    async (request, reply) => {
      try {
        const params = workbenchGenerationIdParamsSchema.parse(request.params) as WorkbenchGenerationIdParams;
        return reply.send(await app.workbenchService.getGeneration(getWorkbenchContext(request), params.generationId));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/workbench/generations/:generationId/retry",
    {
      preHandler: [...authHandlers, requirePermission("flow:run")],
    },
    async (request, reply) => {
      try {
        const params = workbenchGenerationIdParamsSchema.parse(request.params) as WorkbenchGenerationIdParams;
        const result = await app.workbenchService.retryGeneration(getWorkbenchContext(request), params.generationId);
        return reply.code(201).send(result);
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/workbench/results/:resultId/send-to-project",
    {
      preHandler: [...authHandlers, requirePermission("project:update")],
    },
    async (request, reply) => {
      try {
        const params = workbenchResultIdParamsSchema.parse(request.params) as WorkbenchResultIdParams;
        const body = sendWorkbenchResultToProjectSchema.parse(request.body) as SendWorkbenchResultToProjectInput;
        return reply.send(
          await app.workbenchService.sendResultToProject(
            getWorkbenchContext(request),
            params.resultId,
            body,
          ),
        );
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );
}
