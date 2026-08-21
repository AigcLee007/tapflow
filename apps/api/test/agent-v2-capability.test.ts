import { describe, expect, test, vi } from "vitest";

import { AgentApiError, assertV2AgentStreamingCapabilities } from "../src/modules/agent/agent.service.js";

describe("V2 Agent streaming capability gate", () => {
  test("fails closed when the runtime does not expose a route capability checker", async () => {
    const runtime = {
      streamText: vi.fn(),
    };

    await expect(assertV2AgentStreamingCapabilities(runtime, { tenantId: "tenant", userId: "user" }, "creator.route"))
      .rejects.toMatchObject<Partial<AgentApiError>>({
        code: "AGENT_ROUTE_CAPABILITY_REQUIRED",
        statusCode: 400,
      });
    expect(runtime.streamText).not.toHaveBeenCalled();
  });

  test.each([
    { supportsTextStreaming: false, supportsToolCalling: true },
    { supportsTextStreaming: true, supportsToolCalling: false },
  ])("rejects a route missing a required capability: %o", async (capabilities) => {
    const runtime = {
      streamText: vi.fn(),
      getTextStreamingCapabilities: vi.fn().mockResolvedValue(capabilities),
    };

    await expect(assertV2AgentStreamingCapabilities(runtime, { tenantId: "tenant", userId: "user" }, "creator.route"))
      .rejects.toMatchObject<Partial<AgentApiError>>({
        code: "AGENT_ROUTE_CAPABILITY_REQUIRED",
        statusCode: 400,
      });
    expect(runtime.streamText).not.toHaveBeenCalled();
  });

  test("maps an unavailable product route to the same safe capability error", async () => {
    const runtime = {
      streamText: vi.fn(),
      getTextStreamingCapabilities: vi.fn().mockRejectedValue({ code: "ROUTE_NOT_FOUND", details: { routeKey: "internal.route" } }),
    };

    await expect(assertV2AgentStreamingCapabilities(runtime, { tenantId: "tenant", userId: "user" }, "internal.route"))
      .rejects.toMatchObject<Partial<AgentApiError>>({ code: "AGENT_ROUTE_CAPABILITY_REQUIRED", statusCode: 400 });
  });
});
