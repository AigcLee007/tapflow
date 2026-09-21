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

  it("uses canonical history, turn, decision, and mode endpoints", async () => {
    apiGet.mockResolvedValueOnce({ session: { id: "s", title: "x", projectId: null, flowId: null, mode: "manual_confirmation" }, turns: [], messages: [] });
    apiGet.mockResolvedValueOnce({ events: [] });
    apiPost.mockResolvedValue({ blocks: [], phase: "waiting_for_choice", executionState: "idle", sessionId: "s", turnId: "t" });
    apiPatch.mockResolvedValue({ id: "s", title: "x", projectId: null, flowId: null, mode: "auto" });

    await agentV6Api.getHistory("s", { projectId: null, flowId: null, graphRevision: 0 });
    await agentV6Api.listEvents("s", { afterSeq: 3 });
    await agentV6Api.submitTurn("s", { projectId: null, flowId: null, graphRevision: 0, prompt: "hi", idempotencyKey: "i" });
    await agentV6Api.confirmExecution("s", "t", { projectId: null, flowId: null, graphRevision: 0, type: "confirm", idempotencyKey: "i" });
    await agentV6Api.setMode("s", { projectId: null, flowId: null, graphRevision: 0, mode: "auto" });
    await agentV6Api.cancelTurn("s", { sessionId: "s", turnId: "t", projectId: null, flowId: null, graphRevision: 0, idempotencyKey: "i" });

    const paths = [
      ...apiGet.mock.calls,
      ...apiPatch.mock.calls,
      ...apiPost.mock.calls,
    ].map((call) => String(call[0] ?? ""));
    expect(paths.some((path) => /v6-(history|turns|mode|cancel)/.test(path))).toBe(false);
    expect(apiGet.mock.calls[0]?.[0]).toContain("/agent/sessions/s/history");
    expect(apiGet.mock.calls[1]?.[0]).toContain("/agent/sessions/s/events?afterSeq=3");
    expect(apiPost.mock.calls.map((call) => call[0])).toContain("/agent/sessions/s/turns");
    expect(apiPost.mock.calls.map((call) => call[0])).toContain("/agent/sessions/s/turns/t/decisions");
    expect(apiPatch.mock.calls[0]?.[0]).toBe("/agent/sessions/s/mode");
  });

  it("posts confirmation as an allowlisted canonical decision", async () => {
    apiPost.mockResolvedValue({ blocks: [], phase: "executing", executionState: "queued", sessionId: "s", turnId: "t" });
    await agentV6Api.confirmExecution("s", "t", {
      projectId: null,
      flowId: null,
      graphRevision: 0,
      type: "confirm",
      idempotencyKey: "confirm-1",
      payload: { type: "confirm", providerSecret: "must-drop" },
    });
    expect(apiPost.mock.calls[0]?.[0]).toBe("/agent/sessions/s/turns/t/decisions");
    expect(apiPost.mock.calls[0]?.[1]).toMatchObject({ graphRevision: 0, type: "approve_plan", payload: {} });
  });

  it("normalizes a confirmation response with its pending decision", async () => {
    apiPost.mockResolvedValue({
      blocks: [],
      phase: "executing",
      executionState: "running",
      sessionId: "s",
      turnId: "t",
      graphRevision: 4,
      pendingDecision: {
        type: "execute",
        decisionId: "decision-1",
        sessionId: "s",
        turnId: "t",
        graphRevision: 4,
        payload: { prompt: "approved", asset: "data:image/png;base64,secret", provider: "must-drop" },
        idempotencyKey: "idem-1",
        costCredits: 12,
        writesCanvas: true,
      },
    });

    const response = await agentV6Api.confirmExecution("s", "t", {
      projectId: "p",
      flowId: "f",
      graphRevision: 4,
      type: "confirm",
      idempotencyKey: "idem-1",
    });

    expect(response.pendingDecision).toEqual({
      type: "execute",
      decisionId: "decision-1",
      sessionId: "s",
      turnId: "t",
      graphRevision: 4,
      payload: { prompt: "approved" },
      idempotencyKey: "idem-1",
      costCredits: 12,
      writesCanvas: true,
    });
  });

  it("defers the requested mode until after strict canonical session creation", async () => {
    apiPost.mockResolvedValue({ id: "s", title: "x", projectId: "p", flowId: "f", executionMode: "auto" });

    await agentV6Api.createSession({ projectId: "p", flowId: "f", graphRevision: 0, title: "x", mode: "auto" });

    expect(apiPost.mock.calls[0]).toEqual([
      "/agent/sessions",
      { title: "x", projectId: "p", flowId: "f" },
    ]);
  });

  it("refreshes a running canonical turn through its result-projection endpoint", async () => {
    apiGet.mockResolvedValueOnce({ blocks: [], phase: "presenting_results", executionState: "completed", sessionId: "s", turnId: "t", graphRevision: 4 });

    await agentV6Api.refreshTurn("s", "t", { projectId: "p", flowId: "f", graphRevision: 4 });

    expect(apiGet.mock.calls[0]?.[0]).toBe("/agent/sessions/s/turns/t");
  });

  it("normalizes real history executionMode and carries the replay cursor", async () => {
    apiGet.mockResolvedValueOnce({
      session: { id: "s", title: "x", projectId: "p", flowId: "f", executionMode: "auto" },
      turns: [{ id: "t", conversationPhase: "understanding", executionState: "idle", graphRevision: 2, blocksJson: [] }],
      lastSeq: 4,
      replayCursor: "event-4",
    });

    const history = await agentV6Api.getHistory("s", { projectId: "p", flowId: "f", graphRevision: 2 });

    expect(history.session.mode).toBe("auto");
    expect(history.lastSeq).toBe(4);
    expect(history.replayCursor).toBe("event-4");
    expect(apiGet.mock.calls[0]?.[0]).toBe("/agent/sessions/s/history?projectId=p&flowId=f");
  });

  it("returns event cursor metadata and requests the next sequence after history", async () => {
    apiGet.mockResolvedValueOnce({ events: [{ id: "event-5", seq: 5, sessionId: "s", projectId: "p", flowId: "f", eventType: "v6_response", eventJson: {} }], lastSeq: 5, replayCursor: "event-5" });

    const response = await agentV6Api.listEvents("s", { projectId: "p", flowId: "f", afterSeq: 4 });

    expect(response).toMatchObject({ lastSeq: 5, replayCursor: "event-5", events: [{ seq: 5, sessionId: "s", projectId: "p", flowId: "f" }] });
    expect(apiGet.mock.calls[0]?.[0]).toBe("/agent/sessions/s/events?projectId=p&flowId=f&afterSeq=4");
  });

  it("sends the explicit cancellation target and scope to the server", async () => {
    apiPost.mockResolvedValueOnce({ cancelled: true, turnId: "turn-2" });

    await agentV6Api.cancelTurn("s", { sessionId: "s", turnId: "turn-2", projectId: "p", flowId: "f", graphRevision: 2, idempotencyKey: "cancel-2", reason: "stop" });

    expect(apiPost.mock.calls[0]).toEqual([
      "/agent/sessions/s/turns/turn-2/decisions",
      { graphRevision: 2, idempotencyKey: "cancel-2", type: "cancel_execution", payload: {} },
    ]);
  });
});
