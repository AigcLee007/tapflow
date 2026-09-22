import { describe, expect, test } from "vitest";
import { normalizeConsoleQuery, signConsoleCursor } from "../src/modules/console-query/console-query.schemas.js";
describe("console query snapshot pagination", () => {
    const now = new Date("2026-09-21T12:00:00Z");
    const binding = { scope: "self" as const, userId: "user-a", resource: "usage" };
    test("defaults to seven days, 50 rows and rejects unbounded ranges", () => {
        const query = normalizeConsoleQuery({}, binding, "secret", now);
        expect(query).toMatchObject({ limit: 50, from: "2026-09-14T12:00:00.000Z", to: now.toISOString(), asOf: now.toISOString() });
        expect(() => normalizeConsoleQuery({ limit: 101 }, binding, "secret", now)).toThrow();
        expect(() => normalizeConsoleQuery({ from: "2026-01-01T00:00:00Z" }, binding, "secret", now)).toThrow();
    });
    test("cursor carries original window and binds actor, resource, filters and timestamp", () => {
        const query = normalizeConsoleQuery({ billingStatus: "reserved", status: "failed" }, binding, "secret", now);
        const cursor = signConsoleCursor(query, { createdAt: now.toISOString(), id: "usage:abc" }, "secret");
        expect(normalizeConsoleQuery({ billingStatus: "reserved", status: "failed", cursor }, binding, "secret", new Date("2026-09-22T12:00:00Z"))).toMatchObject({ from: query.from, asOf: query.asOf, after: { id: "usage:abc" } });
        for (const input of [{ billingStatus: "released", status: "failed", cursor }, { billingStatus: "reserved", status: "succeeded", cursor }, { billingStatus: "reserved", status: "failed", cursor, asOf: "2026-09-20T12:00:00Z" }, { billingStatus: "reserved", status: "failed", cursor: cursor.slice(0, -3) + "abc" }]) {
            expect(() => normalizeConsoleQuery(input, binding, "secret", now)).toThrow();
        }
        expect(() => normalizeConsoleQuery({ status: "failed", cursor }, { ...binding, userId: "user-b" }, "secret", now)).toThrow();
        expect(() => normalizeConsoleQuery({ status: "failed", cursor }, { ...binding, resource: "tasks" }, "secret", now)).toThrow();
    });
});
