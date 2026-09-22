import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ConsoleScope } from "./console-query.types.js";
export class ConsoleQueryError extends Error {
    constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); }
}
const schema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(4096).optional(),
    from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(), asOf: z.iso.datetime({ offset: true }).optional(),
    status: z.string().regex(/^[a-z_]+$/).max(64).optional(), billingStatus: z.string().regex(/^[a-z_]+$/).max(64).optional(), trafficClass: z.enum(["user_generation", "admin_test", "agent_control", "system", "unknown"]).optional(), source: z.enum(["workflow", "workbench", "agent", "unknown"]).optional(),
    userId: z.uuid().optional(), tenantId: z.uuid().optional(), projectId: z.uuid().optional(), modelId: z.uuid().optional(), routeId: z.uuid().optional(),
}).strict();
export type ConsoleBinding = {
    scope: ConsoleScope;
    userId: string;
    resource: string;
};
export type ConsoleQuery = Omit<z.infer<typeof schema>, "cursor" | "from" | "to" | "asOf"> & ConsoleBinding & {
    from: string;
    to: string;
    asOf: string;
    after?: {
        createdAt: string;
        id: string;
    };
    filterUserId?: string;
    binding: string;
};
function mac(value: string, secret: string) { return createHmac("sha256", secret).update(value).digest("base64url"); }
function invalid(): never { throw new ConsoleQueryError(400, "INVALID_CURSOR", "Cursor is invalid or does not match the query"); }
function timestamp(value: string | Date): string {
    // Preserve Postgres microseconds for stable page boundaries. JavaScript Date
    // truncates them, which can omit records inserted before the query began.
    return typeof value === 'string' && /\.\d{4,6}Z$/.test(value) ? value : new Date(value).toISOString();
}
export function normalizeConsoleQuery(input: unknown, context: ConsoleBinding, secret: string, now = new Date()): ConsoleQuery {
    const raw = schema.parse(input);
    let saved: {
        asOf: string;
        from: string;
        to: string;
        binding: string;
        createdAt: string;
        id: string;
    } | undefined;
    if (raw.cursor) {
        const parts = raw.cursor.split(".");
        if (parts.length !== 2)
            invalid();
        const expected = Buffer.from(mac(parts[0], secret));
        const actual = Buffer.from(parts[1]);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
            invalid();
        try {
            saved = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
        }
        catch {
            invalid();
        }
        if (!saved || !Number.isFinite(Date.parse(saved.createdAt)) || typeof saved.id !== "string")
            invalid();
    }
    const asOf = timestamp(raw.asOf ?? saved?.asOf ?? now);
    const to = timestamp(raw.to ?? saved?.to ?? asOf);
    const from = timestamp(raw.from ?? saved?.from ?? new Date(Date.parse(to) - 7 * 86400000));
    if (Date.parse(from) >= Date.parse(to) || Date.parse(to) - Date.parse(from) > 90 * 86400000 || Date.parse(to) > Date.parse(asOf) || Date.parse(asOf) > now.getTime() + 1000)
        throw new ConsoleQueryError(400, "INVALID_WINDOW", "Date range must be at most 90 days and end no later than asOf");
    if (context.scope === "self" && raw.userId && raw.userId !== context.userId)
        throw new ConsoleQueryError(403, "FORBIDDEN", "Personal queries can only read the signed-in user");
    const filters = { status: raw.status ?? null, billingStatus: raw.billingStatus ?? null, trafficClass: raw.trafficClass ?? null, source: raw.source ?? null, userId: raw.userId ?? null, tenantId: raw.tenantId ?? null, projectId: raw.projectId ?? null, modelId: raw.modelId ?? null, routeId: raw.routeId ?? null };
    const binding = mac(JSON.stringify({ context, filters, from, to, asOf }), secret);
    if (saved && saved.binding !== binding)
        invalid();
    return { ...raw, ...context, filterUserId: raw.userId, from, to, asOf, binding, after: saved ? { createdAt: saved.createdAt, id: saved.id } : undefined };
}
export function signConsoleCursor(query: ConsoleQuery, row: {
    createdAt: string;
    id: string;
}, secret: string): string {
    const body = Buffer.from(JSON.stringify({ from: query.from, to: query.to, asOf: query.asOf, binding: query.binding, ...row })).toString("base64url");
    return `${body}.${mac(body, secret)}`;
}
