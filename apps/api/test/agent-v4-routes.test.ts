import { describe, expect, it, vi } from "vitest";
import { ZodError, z } from "zod";
import { sendV4Error } from "../src/modules/agent/v4/agent-v4.routes.js";

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
});
