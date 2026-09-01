import { describe, expect, it, vi } from "vitest";
import { ZodError, z } from "zod";
import { registerAgentV4Routes, sendV4Error } from "../src/modules/agent/v4/agent-v4.routes.js";

describe("Agent V4 route error contract", () => {
  it("maps schema errors to 400 with a stable code", () => {
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
    const issue = z.object({ prompt: z.string().min(1) }).safeParse({ prompt: "" });
    expect(issue.success).toBe(false);
    sendV4Error(issue.success ? null : new ZodError(issue.error.issues), reply);
    expect(reply.code).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ error: { code: "INVALID_REQUEST" } });
  });

  it("preserves typed runtime status codes", () => {
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
    sendV4Error(Object.assign(new Error("AGENT_V4_UNAVAILABLE"), { statusCode: 503 }), reply);
    expect(reply.code).toHaveBeenCalledWith(503);
    expect(reply.send).toHaveBeenCalledWith({ error: { code: "AGENT_V4_UNAVAILABLE" } });
  });

  it("uses the safe projection for the normal JSON turn response", async () => {
    const routes = new Map<string, { handler: (request: any, reply: any) => Promise<unknown> }>();
    const app: any = {
      agentV4Runtime: {
        startTurn: vi.fn(async () => ({ taskId: "task-1", status: "preview_ready", summary: "safe", provider: "hidden" })),
      },
      post: vi.fn((path: string, _options: unknown, handler: any) => routes.set(path, { handler })),
      get: vi.fn(),
    };
    registerAgentV4Routes(app);
    const send = vi.fn().mockReturnThis();
    await routes.get("/api/v2/agent/v4/sessions/:sessionId/turns")!.handler(
      { params: { sessionId: "session-1" }, body: { prompt: "plan" }, ctx: { tenantId: "tenant-1", userId: "user-1" } },
      { send },
    );
    expect(send).toHaveBeenCalledWith({ taskId: "task-1", status: "preview_ready", summary: "safe" });
  });
});
