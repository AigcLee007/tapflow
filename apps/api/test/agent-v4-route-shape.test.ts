import { describe, expect, it } from "vitest";
import { parseV4AfterSequence, readAgentV4RouteResponse } from "../src/modules/agent/v4/agent-v4-route-contract.js";

describe("Agent V4 turn route response contract", () => {
  it("keeps normal turns JSON and stream turns SSE", () => {
    expect(readAgentV4RouteResponse(false, { taskId: "task-1", status: "waiting_for_approval" })).toEqual({ taskId: "task-1", status: "waiting_for_approval" });
    expect(readAgentV4RouteResponse(true, { taskId: "task-1", status: "waiting_for_approval" })).toContain("event: done");
  });

  it("redacts unsafe fields from the browser-facing stream projection", () => {
    const response = readAgentV4RouteResponse(true, {
      taskId: "task-2",
      status: "preview_ready",
      summary: "safe",
      provider: "secret-provider",
      signedUrl: "https://example.invalid/private",
      credential: "do-not-send",
      unknownInternalField: "do-not-send",
    });

    expect(response).toContain('"summary":"safe"');
    expect(response).not.toContain("secret-provider");
    expect(response).not.toContain("example.invalid");
    expect(response).not.toContain("do-not-send");
  });

  it("fails closed for invalid replay cursors", () => {
    expect(parseV4AfterSequence(undefined)).toBe(0);
    expect(parseV4AfterSequence("12")).toBe(12);
    expect(parseV4AfterSequence("-4")).toBe(0);
    expect(() => parseV4AfterSequence("abc")).toThrow("INVALID_REQUEST");
    expect(() => parseV4AfterSequence("Infinity")).toThrow("INVALID_REQUEST");
  });
});
