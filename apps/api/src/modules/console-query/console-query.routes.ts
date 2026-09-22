import type { FastifyInstance, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { requireAuth, requirePermission } from "../../http/auth-middleware.js";
import { PlatformTransactionError } from "../../http/platform-transaction.js";
import { ConsoleQueryError } from "./console-query.schemas.js";
import type { ConsoleQueryService } from "./console-query.service.js";
export function registerConsoleQueryRoutes(app: FastifyInstance, service: ConsoleQueryService): void {
    const register = (url: string, permission: string | null, handler: (r: FastifyRequest) => Promise<unknown>) => {
        app.get(url, { preHandler: permission ? [requireAuth, requirePermission(permission)] : [requireAuth] }, async (request, reply) => {
            try {
                return await handler(request);
            }
            catch (error) {
                if (error instanceof ZodError)
                    return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query', requestId: request.ctx.requestId } });
                if (error instanceof ConsoleQueryError || error instanceof PlatformTransactionError)
                    return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, requestId: request.ctx.requestId } });
                request.log.error({ err: error }, 'console query failed');
                return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试。', requestId: request.ctx.requestId } });
            }
        });
    };
    const id = (r: FastifyRequest) => (r.params as {
        id: string;
    }).id;
    for (const [prefix, scope] of [['me', 'self'], ['admin', 'platform']] as const) {
        const usagePermission = scope === 'platform' ? 'platform:usage:read' : null;
        const taskPermission = scope === 'platform' ? 'platform:tasks:read' : null;
        register(`/api/v2/${prefix}/usage-events`, usagePermission, r => service.listUsage(r.ctx, scope, r.query));
        register(`/api/v2/${prefix}/usage-events/:id`, usagePermission, r => service.getUsage(r.ctx, scope, id(r)));
        register(`/api/v2/${prefix}/tasks`, taskPermission, r => service.listTasks(r.ctx, scope, r.query));
        register(`/api/v2/${prefix}/tasks/:id`, taskPermission, r => service.getTask(r.ctx, scope, id(r)));
        register(`/api/v2/${prefix}/overview`, usagePermission, r => service.overview(r.ctx, scope, r.query));
    }
    register('/api/v2/admin/ai/calls', 'platform:usage:read', r => service.listCalls(r.ctx, r.query));
    register('/api/v2/admin/ai/calls/:id', 'platform:usage:read', r => service.getCall(r.ctx, id(r)));
    register('/api/v2/billing/activity', null, r => service.listActivity(r.ctx, r.query));
    register('/api/v2/admin/users/:id/ledger', 'platform:users:read', r => service.listUserActivity(r.ctx, id(r), r.query));
}
