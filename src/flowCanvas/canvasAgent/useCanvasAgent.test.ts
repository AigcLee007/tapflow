import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { V2HttpError } from "../../services/v2HttpClient";
import type { CanvasAgentEvent, CanvasAgentSession } from "./canvasAgentTypes";
import { useCanvasAgent } from "./useCanvasAgent";

type Stream = (sessionId: string, input: unknown, onEvent: (event: CanvasAgentEvent) => void, signal: AbortSignal) => Promise<void>;

const api = vi.hoisted(() => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  listFiles: vi.fn(),
  listSessions: vi.fn(),
  resume: vi.fn(),
  sendMessage: vi.fn(),
  stop: vi.fn(),
  updateSession: vi.fn(),
}));
vi.mock("./canvasAgentApi", () => ({ canvasAgentApi: api }));

const session = (patch: Partial<CanvasAgentSession> = {}): CanvasAgentSession => ({
  createdAt: "2026-10-01T00:00:00Z", flowId: "flow-1", id: "s1", messageSeq: 0, mode: "manual", pending: null, projectId: "p1",
  status: "idle", textRouteKey: null, title: "新建对话", updatedAt: "2026-10-01T00:00:00Z", ...patch,
});
const canvas = { nodes: [], revision: 2, selectedNodeIds: [] };
const setup = () => renderHook(() => useCanvasAgent({ flowId: "flow-1", getCanvas: () => canvas }));

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listSessions.mockResolvedValue([]);
  api.listFiles.mockResolvedValue([]);
  api.createSession.mockResolvedValue(session());
  api.getSession.mockResolvedValue({ messages: [], session: session() });
  api.stop.mockResolvedValue({ stopped: true });
});

describe("useCanvasAgent", () => {
  test("first message creates a session, sends the canvas and folds the stream", async () => {
    api.sendMessage.mockImplementation((async (_id, _input, onEvent) => {
      onEvent({ phase: "thinking", type: "status" });
      onEvent({ text: "收到。", type: "text_delta" });
      onEvent({ callId: "c1", name: "canvas_inspect", title: "查看当前画布节点与素材", type: "tool_started" });
      onEvent({ callId: "c1", durationMs: 5, name: "canvas_inspect", ok: true, title: "查看当前画布节点与素材", type: "tool_finished" });
      onEvent({ reason: "completed", type: "done" });
    }) as Stream);
    const { result } = setup();
    await act(async () => { await result.current.send("做一套详情页"); });

    expect(api.createSession).toHaveBeenCalledWith("flow-1", "manual");
    expect(api.sendMessage).toHaveBeenCalledWith("s1", { canvas, content: "做一套详情页" }, expect.any(Function), expect.any(AbortSignal));
    expect(result.current.items.map((item) => item.kind)).toEqual(["user", "assistant", "steps"]);
    expect(result.current.busy).toBe(false);
    expect(result.current.phase).toBe("idle");
  });

  test("stop aborts the stream: running steps become stopped, no error shown", async () => {
    api.sendMessage.mockImplementation((async (_id, _input, onEvent, signal) => {
      onEvent({ callId: "c1", name: "asset_search", title: "检索素材库", type: "tool_started" });
      await new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }) as Stream);
    const { result } = setup();
    let sending: Promise<void> = Promise.resolve();
    act(() => { sending = result.current.send("开始"); });
    await waitFor(() => expect(result.current.busy).toBe(true));
    await act(async () => { await result.current.stop(); await sending; });

    expect(api.stop).toHaveBeenCalledWith("s1");
    expect(result.current.items.find((item) => item.kind === "steps")).toMatchObject({ steps: [{ status: "stopped" }] });
    expect(result.current.items.some((item) => item.kind === "error")).toBe(false);
    expect(result.current.busy).toBe(false);
  });

  test("answering a card marks it answered and resumes with the payload", async () => {
    const pending = { callId: "c_ask", kind: "questions" as const, questions: [{ allowFreeText: true, id: "q", options: [{ id: "a", label: "A" }], prompt: "选哪个？", selection: "single" as const }], toolName: "ask_user" as const };
    api.getSession.mockResolvedValue({ messages: [], session: session({ pending, status: "waiting" }) });
    api.resume.mockImplementation((async (_id, _input, onEvent) => { onEvent({ reason: "completed", type: "done" }); }) as Stream);
    const { result } = setup();
    await act(async () => { await result.current.openSession("s1"); });
    expect(result.current.items[0]).toMatchObject({ kind: "questions", state: "open" });

    await act(async () => { await result.current.answerQuestions("c_ask", pending.questions, { answers: [{ optionIds: ["a"], questionId: "q" }] }); });
    expect(api.resume).toHaveBeenCalledWith("s1", { callId: "c_ask", canvas, payload: { answers: [{ optionIds: ["a"], questionId: "q" }] } }, expect.any(Function), expect.any(AbortSignal));
    expect(result.current.items[0]).toMatchObject({ answers: [{ selected: ["A"] }], state: "answered" });
  });

  test("a server error is shown and the panel becomes usable again", async () => {
    api.sendMessage.mockRejectedValue(new V2HttpError({ code: "CANVAS_AGENT_ROUTE_NOT_ENABLED", message: "Agent 使用的文本线路还没开启工具调用", status: 503 }));
    const { result } = setup();
    await act(async () => { await result.current.send("你好"); });
    expect(result.current.items.at(-1)).toMatchObject({ kind: "error", message: "Agent 使用的文本线路还没开启工具调用" });
    expect(result.current.busy).toBe(false);
  });
});
