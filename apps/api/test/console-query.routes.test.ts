import Fastify from "fastify";
import { afterEach, expect, test, vi } from "vitest";
import { registerConsoleQueryRoutes } from "../src/modules/console-query/console-query.routes.js";
import type { ConsoleQueryService } from "../src/modules/console-query/console-query.service.js";
const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(x => x.close())); });
function create(permissions: string[], userId: string | null = '20000000-0000-4000-8000-000000000001') {
    const app = Fastify();
    apps.push(app);
    const service = { listUsage: vi.fn(async () => ({ items: [] })), getUsage: vi.fn(async () => ({ item: {} })), listTasks: vi.fn(async () => ({ items: [] })), getTask: vi.fn(async () => ({ item: {} })), overview: vi.fn(async () => ({})), listCalls: vi.fn(async () => ({ items: [] })), getCall: vi.fn(async () => ({ item: {} })), listActivity: vi.fn(async () => ({ items: [] })) };
    app.addHook('onRequest', async (r) => { r.ctx = { isAuthenticated: !!userId, userId, permissions, roles: [], tenantId: null, sessionId: null, requestId: 'test', traceId: 'test', ipHash: null, userAgent: null }; });
    registerConsoleQueryRoutes(app, service as unknown as ConsoleQueryService);
    return { app, service };
}
test('anonymous and tenant admins cannot reach platform query APIs', async () => {
    for (const user of [null, '20000000-0000-4000-8000-000000000001']) {
        const { app, service } = create(['admin:system'], user);
        for (const path of ['usage-events', 'tasks', 'overview', 'ai/calls'])
            expect((await app.inject(`/api/v2/admin/${path}`)).statusCode).toBe(user ? 403 : 401);
        expect(service.listUsage).not.toHaveBeenCalled();
    }
});
test('self endpoints do not require selected tenant, and platform read permissions stay separate', async () => {
    const { app, service } = create(['platform:usage:read']);
    for (const path of ['/api/v2/me/usage-events', '/api/v2/me/tasks', '/api/v2/me/overview', '/api/v2/billing/activity', '/api/v2/admin/usage-events', '/api/v2/admin/ai/calls'])
        expect((await app.inject(path)).statusCode).toBe(200);
    expect((await app.inject('/api/v2/admin/tasks')).statusCode).toBe(403);
    expect(service.listUsage).toHaveBeenCalledWith(expect.objectContaining({ tenantId: null }), 'self', {});
});
