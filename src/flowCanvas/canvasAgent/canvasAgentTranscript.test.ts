import { describe, expect, test } from "vitest";

import { drainSseBuffer } from "./canvasAgentApi";
import { buildCanvasSnapshot } from "./canvasAgentSnapshot";
import { applyAgentEvent, transcriptFromHistory, type TranscriptItem } from "./canvasAgentTranscript";
import type { CanvasAgentEvent, CanvasAgentPending, CanvasAgentSession, CanvasAgentStoredMessage } from "./canvasAgentTypes";

const plan = { estimatedCredits: 12, modelKey: "seedream-5-pro", routeKey: "r1", tasks: [{ aspectRatio: "3:4", count: 1, prompt: "p", referenceAssetIds: [], size: "2K" as const, title: "款式候选A" }] };
const questionsPending: CanvasAgentPending = { callId: "c_ask", kind: "questions", questions: [{ allowFreeText: true, id: "q", options: [{ id: "a", label: "A" }], prompt: "选哪个？", selection: "single" }], toolName: "ask_user" };

const fold = (events: CanvasAgentEvent[], start: TranscriptItem[] = []) => events.reduce(applyAgentEvent, start);

describe("applyAgentEvent", () => {
  test("streams text, groups tool steps, and turns interactive tools into cards", () => {
    const items = fold([
      { phase: "thinking", type: "status" },
      { text: "收到，", type: "text_delta" },
      { text: "我先看看画布。", type: "text_delta" },
      { callId: "c1", name: "canvas_inspect", title: "查看当前画布节点与素材", type: "tool_started" },
      { callId: "c1", durationMs: 40, name: "canvas_inspect", ok: true, summary: "3 个节点", title: "查看当前画布节点与素材", type: "tool_finished" },
      { callId: "c2", name: "model_contract", title: "查看 seedream 参数", type: "tool_started" },
      { callId: "c_ask", name: "ask_user", title: "向你确认关键方向", type: "tool_started" },
      { callId: "c_ask", durationMs: 1, name: "ask_user", ok: true, summary: "等待你回答", title: "向你确认关键方向", type: "tool_finished" },
      { pending: questionsPending, type: "waiting" },
      { reason: "waiting", type: "done" },
    ]);
    expect(items.map((item) => item.kind)).toEqual(["assistant", "steps", "questions"]);
    expect(items[0]).toMatchObject({ streaming: false, text: "收到，我先看看画布。" });
    const steps = items[1] as Extract<TranscriptItem, { kind: "steps" }>;
    expect(steps.steps.map((step) => [step.name, step.status])).toEqual([["canvas_inspect", "ok"], ["model_contract", "stopped"]]);
    expect(items[2]).toMatchObject({ callId: "c_ask", state: "open" });
  });

  test("a failed interactive tool shows as a failed step; a waiting event replaces the card in place", () => {
    const failed = fold([{ callId: "g", durationMs: 2, name: "propose_generation", ok: false, summary: "比例不支持", title: "准备生成", type: "tool_finished" }]);
    expect(failed[0]).toMatchObject({ kind: "steps", steps: [{ status: "failed", summary: "比例不支持" }] });

    const approval = fold([{ pending: { callId: "g", kind: "generation_approval", plan, toolName: "propose_generation" }, type: "waiting" }]);
    const generating = fold([{ pending: { callId: "g", kind: "canvas_generate", plan, toolName: "propose_generation" }, type: "waiting" }], approval);
    expect(generating).toHaveLength(1);
    expect(generating[0]).toMatchObject({ kind: "generation", state: "generating" });
  });

  test("errors end streaming and append a message", () => {
    const items = fold([{ text: "hi", type: "text_delta" }, { code: "X", message: "模型服务暂时不可用", type: "error" }]);
    expect(items).toMatchObject([{ kind: "assistant", streaming: false }, { kind: "error", message: "模型服务暂时不可用" }]);
  });
});

describe("transcriptFromHistory", () => {
  const base = { createdAt: "", display: null, seq: 0, toolCallId: null, toolCalls: null, toolName: null };
  const session = { pending: questionsPending, status: "waiting" } as unknown as CanvasAgentSession;
  test("rebuilds steps, answered cards and the open pending card", () => {
    const messages: CanvasAgentStoredMessage[] = [
      { ...base, content: "做详情页", id: "m1", role: "user" },
      { ...base, content: "好的。", id: "m2", role: "assistant", toolCalls: [{ callId: "c1", name: "canvas_inspect" }] },
      { ...base, content: "", display: { durationMs: 30, ok: true, summary: "空画布", title: "查看当前画布节点与素材" }, id: "m3", role: "tool", toolCallId: "c1", toolName: "canvas_inspect" },
      { ...base, content: "", display: { card: { answers: [{ question: "风格？", questionId: "s", selected: ["山系"] }], kind: "questions", questions: [{ allowFreeText: true, id: "s", options: [], prompt: "风格？", selection: "single" }] }, title: "向你确认关键方向" }, id: "m4", role: "tool", toolCallId: "c_old", toolName: "ask_user" },
      { ...base, content: "", display: { card: { approved: false, kind: "generation", plan }, title: "确认生成" }, id: "m5", role: "tool", toolCallId: "g1", toolName: "propose_generation" },
    ];
    const items = transcriptFromHistory(messages, session);
    expect(items.map((item) => [item.kind, "state" in item ? item.state : null])).toEqual([
      ["user", null], ["assistant", null], ["steps", null], ["questions", "answered"], ["generation", "rejected"], ["questions", "open"],
    ]);
  });
});

describe("drainSseBuffer", () => {
  test("parses complete frames, ignores pings and keeps the unfinished tail", () => {
    const events: CanvasAgentEvent[] = [];
    const rest = drainSseBuffer(': ping\n\nevent: text_delta\ndata: {"type":"text_delta","text":"你"}\n\nevent: done\r\ndata: {"type":"do', (event) => events.push(event));
    expect(events).toEqual([{ text: "你", type: "text_delta" }]);
    drainSseBuffer(`${rest}ne","reason":"completed"}\n\n`, (event) => events.push(event));
    expect(events.at(-1)).toEqual({ reason: "completed", type: "done" });
  });
});

describe("buildCanvasSnapshot", () => {
  test("keeps the fields the agent needs, within the server limits", () => {
    const snapshot = buildCanvasSnapshot({ nodes: [
      { data: { assetId: "a1", generationPrompt: "x".repeat(3000), kind: "image", status: "success", title: "主图" }, id: "n1", selected: true, type: "image" },
      { data: { kind: "text", text: "卖点文案" }, id: "n2", type: "text" },
    ], version: 7 });
    expect(snapshot).toMatchObject({ revision: 7, selectedNodeIds: ["n1"] });
    expect(snapshot.nodes[0]).toMatchObject({ assetId: "a1", title: "主图", type: "image" });
    expect(snapshot.nodes[0]!.prompt).toHaveLength(2000);
    expect(snapshot.nodes[1]).toMatchObject({ assetId: null, prompt: "卖点文案", type: "text" });
  });
});
