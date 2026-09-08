import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiGet, apiPatch, apiPost } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPatch: vi.fn(), apiPost: vi.fn() }));

vi.mock("../../../../services/v2HttpClient", () => ({ apiGet, apiPatch, apiPost }));

import { agentV6Api } from "./agentV6Api";

describe("agentV6Api contract adapter", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPatch.mockReset();
    apiPost.mockReset();
  });

  it("uses existing history/events and V5/V2 endpoints instead of invented V6 routes", async () => {
    apiGet.mockResolvedValueOnce({ session: { id: "s", title: "x", projectId: null, flowId: null, mode: "manual_confirmation" }, turns: [], messages: [] });
    apiGet.mockResolvedValueOnce({ events: [] });
    apiPost.mockResolvedValue({ blocks: [], phase: "waiting_for_choice", executionState: "idle", sessionId: "s", turnId: "t" });
    apiPatch.mockResolvedValue({ id: "s", title: "x", projectId: null, flowId: null, mode: "auto" });

    await agentV6Api.getHistory("s", { projectId: null, flowId: null, graphRevision: 0 });
    await agentV6Api.listEvents("s", { afterSeq: 3 });
    await agentV6Api.submitTurn("s", { projectId: null, flowId: null, graphRevision: 0, prompt: "hi", idempotencyKey: "i" });
    await agentV6Api.confirmExecution("s", "t", { projectId: null, flowId: null, graphRevision: 0, type: "confirm", idempotencyKey: "i" });
    await agentV6Api.setMode("s", { projectId: null, flowId: null, graphRevision: 0, mode: "auto" });
    await agentV6Api.cancelTurn("s", { sessionId: "s", projectId: null, flowId: null, graphRevision: 0, idempotencyKey: "i" });

    const paths = [
      ...apiGet.mock.calls,
      ...apiPatch.mock.calls,
      ...apiPost.mock.calls,
    ].map((call) => String(call[0] ?? ""));
    expect(paths.some((path) => /v6-(history|turns|mode|cancel)/.test(path))).toBe(false);
    expect(apiGet.mock.calls[0]?.[0]).toContain("/agent/sessions/s/history");
    expect(apiGet.mock.calls[1]?.[0]).toContain("/agent/sessions/s/events?afterSeq=3");
    expect(apiPost.mock.calls.map((call) => call[0])).toContain("/agent/sessions/s/v5-turns");
    expect(apiPost.mock.calls.map((call) => call[0])).toContain("/agent/sessions/s/cancel");
    expect(apiPatch.mock.calls[0]?.[0]).toBe("/agent/sessions/s/v5-mode");
  });

  it("posts confirmation as an allowlisted V5 decision", async () => {
    apiPost.mockResolvedValue({ blocks: [], phase: "executing", executionState: "queued", sessionId: "s", turnId: "t" });
    await agentV6Api.confirmExecution("s", "t", {
      projectId: null,
      flowId: null,
      graphRevision: 0,
      type: "confirm",
      idempotencyKey: "confirm-1",
      payload: { type: "confirm", providerSecret: "must-drop" },
    });
    expect(apiPost.mock.calls[0]?.[1]).toEqual({ decision: { type: "confirm" } });
  });
});
