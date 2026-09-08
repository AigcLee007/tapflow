import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentSessionController } from "./AgentSessionController";
import { AgentTurnController } from "./AgentTurnController";
import type { AgentV6Api, AgentV6Response, AgentV6Scope } from "./agentV6Api";
import { ReplayController } from "../replay/ReplayController";

const scope: AgentV6Scope = { projectId: "project-1", flowId: "flow-1", graphRevision: 7 };

function response(overrides: Partial<AgentV6Response> = {}): AgentV6Response {
  return {
    sessionId: "session-1",
    turnId: "turn-1",
    phase: "understanding",
    executionState: "idle",
    mode: "manual_confirmation",
    graphRevision: 7,
    blocks: [{ type: "understanding", text: "正在理解" }],
    ...overrides,
  };
}

function makeApi(): AgentV6Api & { calls: Array<{ method: string; input: unknown }> } {
  const calls: Array<{ method: string; input: unknown }> = [];
  return {
    calls,
    createSession: vi.fn(async (input) => { calls.push({ method: "createSession", input }); return { id: "session-1", title: "新对话", projectId: input.projectId, flowId: input.flowId, mode: input.mode ?? "manual_confirmation" }; }),
    listSessions: vi.fn(async (input) => { calls.push({ method: "listSessions", input }); return []; }),
    getSession: vi.fn(async (sessionId, input) => { calls.push({ method: "getSession", input: { sessionId, ...input } }); return { id: sessionId, title: "已保存", projectId: input.projectId, flowId: input.flowId, mode: "auto" }; }),
    getHistory: vi.fn(async (sessionId, input) => { calls.push({ method: "getHistory", input: { sessionId, ...input } }); return { session: { id: sessionId, title: "历史", projectId: input.projectId, flowId: input.flowId, mode: "manual_confirmation" }, responses: [] }; }),
    submitTurn: vi.fn(async (sessionId, input) => { calls.push({ method: "submitTurn", input: { sessionId, ...input } }); return response({ sessionId, turnId: "turn-1" }); }),
    submitDecision: vi.fn(async (sessionId, turnId, input) => { calls.push({ method: "submitDecision", input: { sessionId, turnId, ...input } }); return response({ sessionId, turnId, phase: "drafting_brief" }); }),
    confirmExecution: vi.fn(async (sessionId, turnId, input) => { calls.push({ method: "confirmExecution", input: { sessionId, turnId, ...input } }); return response({ sessionId, turnId, phase: "executing", executionState: "running" }); }),
    setMode: vi.fn(async (sessionId, input) => { calls.push({ method: "setMode", input: { sessionId, ...input } }); return { id: sessionId, title: "已保存", projectId: input.projectId, flowId: input.flowId, mode: input.mode }; }),
    cancelTurn: vi.fn(async (sessionId, input) => { calls.push({ method: "cancelTurn", input: { sessionId, ...input } }); return { cancelled: true, turnId: input.turnId }; }),
  };
}

describe("Agent V6 session and turn controllers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates, lists, opens, and resets sessions with project/flow scope", async () => {
    const api = makeApi();
    const sessions = new AgentSessionController(api);
    await sessions.create({ ...scope, title: "第一轮" });
    await sessions.list(scope);
    await sessions.get("session-1", scope);
    sessions.newSession();
    expect(api.calls.map((call) => call.method)).toEqual(["createSession", "listSessions", "getSession"]);
    expect(api.calls[0]?.input).toMatchObject(scope);
    expect(sessions.sessionId).toBeNull();
    expect(sessions.title).toBe("新对话");
    expect(sessions.mode).toBe("manual_confirmation");
  });

  it("submits turns and decisions with scope, revision, and stable idempotency", async () => {
    const api = makeApi();
    const sessions = new AgentSessionController(api);
    await sessions.create(scope);
    const turns = new AgentTurnController(api, sessions);
    await turns.submit({ prompt: "做一个方案", idempotencyKey: "turn-idem", ...scope });
    await turns.decision({ type: "select_choice", optionIds: ["a"] }, { ...scope, sessionId: "session-1", turnId: "turn-1", idempotencyKey: "decision-idem" });
    await turns.confirm({ ...scope, sessionId: "session-1", turnId: "turn-1", idempotencyKey: "confirm-idem" });
    expect(api.calls.find((call) => call.method === "submitTurn")?.input).toMatchObject({ projectId: "project-1", flowId: "flow-1", graphRevision: 7, idempotencyKey: "turn-idem" });
    expect(api.calls.find((call) => call.method === "submitDecision")?.input).toMatchObject({ projectId: "project-1", flowId: "flow-1", graphRevision: 7, idempotencyKey: "decision-idem" });
    expect(api.calls.find((call) => call.method === "confirmExecution")?.input).toMatchObject({ projectId: "project-1", flowId: "flow-1", graphRevision: 7, idempotencyKey: "confirm-idem" });
  });

  it("persists mode, cancels, and preserves stale revision/idempotency errors from the API", async () => {
    const api = makeApi();
    const sessions = new AgentSessionController(api);
    await sessions.create(scope);
    const turns = new AgentTurnController(api, sessions);
    await turns.setMode("auto", scope);
    await turns.cancel({ ...scope, sessionId: "session-1", turnId: "turn-1", idempotencyKey: "cancel-idem", reason: "用户停止" });
    expect(sessions.mode).toBe("auto");
    expect(api.calls.find((call) => call.method === "setMode")?.input).toMatchObject({ projectId: "project-1", flowId: "flow-1", graphRevision: 7, mode: "auto" });
    expect(api.calls.find((call) => call.method === "cancelTurn")?.input).toMatchObject({ projectId: "project-1", flowId: "flow-1", graphRevision: 7, idempotencyKey: "cancel-idem", turnId: "turn-1" });
  });

  it("does not swallow server stale-revision or duplicate-idempotency failures", async () => {
    const api = makeApi();
    api.submitTurn = vi.fn(async () => { throw Object.assign(new Error("stale"), { status: 409, code: "AGENT_V6_STALE_REVISION" }); });
    const sessions = new AgentSessionController(api);
    await sessions.create(scope);
    const turns = new AgentTurnController(api, sessions);
    await expect(turns.submit({ ...scope, prompt: "重试", idempotencyKey: "same-key" })).rejects.toMatchObject({ status: 409, code: "AGENT_V6_STALE_REVISION" });
  });

  it("projects cancellation locally without invoking execution APIs", async () => {
    const api = makeApi();
    const replay = new ReplayController(scope);
    const sessions = new AgentSessionController(api);
    await sessions.create(scope);
    const turns = new AgentTurnController(api, sessions, replay);
    const response = await turns.cancel({ ...scope, sessionId: "session-1", turnId: "turn-1", idempotencyKey: "cancel-idem", reason: "用户停止" });
    expect(response.phase).toBe("failed");
    expect(replay.state.phase).toBe("failed");
    expect(api.calls.map((call) => call.method)).toEqual(["createSession", "cancelTurn"]);
  });
});
