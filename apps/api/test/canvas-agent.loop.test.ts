import { describe, expect, test } from "vitest";
import { AiGatewayError } from "@aigc-flow/ai-gateway-core";

import { CanvasAgentLoop, buildModelMessages } from "../src/modules/canvas-agent/canvas-agent.loop.js";
import { CanvasAgentService, type CanvasAgentRun } from "../src/modules/canvas-agent/canvas-agent.service.js";
import { infoTools } from "../src/modules/canvas-agent/canvas-agent.tools.js";
import { interactiveTools } from "../src/modules/canvas-agent/canvas-agent.interactive-tools.js";
import type { CanvasAgentContext, CanvasAgentEvent, CanvasAgentMode } from "../src/modules/canvas-agent/canvas-agent.types.js";
import { CREDITS_PER_IMAGE, IMAGE_MODEL, MemoryCanvasAgentRepository, calls, fakeDeps, say, scriptedRuntime } from "./fixtures/canvas-agent-fakes.js";

const ctx: CanvasAgentContext = { permissions: ["flow:read", "flow:update", "asset:update"], tenantId: "tenant-1", userId: "user-1" };
const canvas = {
  nodes: [{ assetId: "11111111-1111-4111-8111-111111111111", id: "n1", title: "白底图", type: "image" }],
  revision: 3,
  selectedNodeIds: ["n1"],
};
const oneQuestion = { questions: [{ id: "q", options: [{ id: "a", label: "A" }], prompt: "选哪个？" }] };

async function setup(rounds: Parameters<typeof scriptedRuntime>[0], options?: { maxRounds?: number; mode?: CanvasAgentMode }) {
  const repository = new MemoryCanvasAgentRepository();
  const deps = fakeDeps(repository);
  const runtime = scriptedRuntime(rounds);
  const loop = new CanvasAgentLoop({ deps, maxRounds: options?.maxRounds, textRuntime: runtime, tools: [...infoTools, ...interactiveTools] });
  const service = new CanvasAgentService({ defaultRouteKey: "text.agent", deps, loop, textRuntime: runtime });
  const session = await service.createSession(ctx, { flowId: repository.addFlow(ctx), mode: options?.mode });
  return { deps, repository, runtime, service, session };
}

async function drive(run: CanvasAgentRun, signal = new AbortController().signal): Promise<CanvasAgentEvent[]> {
  const events: CanvasAgentEvent[] = [];
  await run((event) => events.push(event), signal);
  return events;
}

const ofType = <T extends CanvasAgentEvent["type"]>(events: CanvasAgentEvent[], type: T) =>
  events.filter((event): event is Extract<CanvasAgentEvent, { type: T }> => event.type === type);

const toolResult = (messages: Array<{ content: string; role: string; toolCallId?: string }>, callId?: string) =>
  JSON.parse(messages.find((m) => m.role === "tool" && (!callId || m.toolCallId === callId))!.content);

describe("canvas agent loop", () => {
  test("answers without tools, titles the session and completes", async () => {
    const { repository, runtime, service, session } = await setup([say("你好，我来帮你。")]);
    const events = await drive(await service.startMessage(ctx, session.id, { canvas: null, content: "你好" }));

    expect(ofType(events, "text_delta").map((e) => e.text).join("")).toBe("你好，我来帮你。");
    expect(events.at(-1)).toEqual({ reason: "completed", type: "done" });
    expect(await repository.getSession(ctx, session.id)).toMatchObject({ status: "idle", title: "你好" });
    expect(repository.messages.get(session.id)!.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(runtime.requests[0]!.messages[0]).toMatchObject({ role: "system" });
    expect(runtime.requests[0]!.tools!.map((t) => t.name)).toEqual(expect.arrayContaining(["canvas_inspect", "ask_user", "propose_generation", "file_write"]));
  });

  test("runs tools, pauses on questions, and resumes with validated answers", async () => {
    const ask = { questions: [
      { id: "material", options: [{ id: "ai", label: "全套AI生成", recommended: true }, { id: "upload", label: "我上传实物图" }], prompt: "是否有实物图？", tag: "素材现状" },
      { id: "style", options: [{ id: "mountain", label: "山系机能探索风" }], prompt: "视觉风格？" },
    ] };
    const { repository, runtime, service, session } = await setup([
      [{ text: "收到，我先看看画布。", type: "text_delta" }, ...calls(["canvas_inspect", {}])],
      calls(["ask_user", ask, "call_ask"]),
      say("好的，按全套AI生成、山系机能风推进。"),
    ]);

    const first = await drive(await service.startMessage(ctx, session.id, { canvas, content: "做一套小王子男童羽绒服详情页" }));
    expect(ofType(first, "tool_finished")[0]).toMatchObject({ name: "canvas_inspect", ok: true, summary: "1 个节点，1 张图片，选中 1 个", title: "查看当前画布节点与素材" });
    expect(ofType(first, "waiting")[0]).toMatchObject({ pending: { callId: "call_ask", kind: "questions" } });
    expect(first.at(-1)).toEqual({ reason: "waiting", type: "done" });
    expect((await repository.getSession(ctx, session.id)).status).toBe("waiting");

    const second = await drive(await service.startResume(ctx, session.id, { callId: "call_ask", canvas, payload: { answers: [
      { optionIds: ["ai"], questionId: "material" }, { questionId: "style", text: "山系，但更活泼" },
    ] } }));
    expect(second.at(-1)).toEqual({ reason: "completed", type: "done" });
    expect(toolResult(runtime.requests[2]!.messages, "call_ask")).toMatchObject({
      answers: [{ questionId: "material", selected: ["全套AI生成"] }, { questionId: "style", text: "山系，但更活泼" }],
    });
    expect(await repository.getSession(ctx, session.id)).toMatchObject({ pending: null, status: "idle" });
    // The stored step keeps questions + answers so a reopened history can render the card.
    expect(repository.messages.get(session.id)!.find((m) => m.toolCallId === "call_ask")!.display)
      .toMatchObject({ card: { answers: expect.any(Array), kind: "questions" }, title: "向你确认关键方向" });
  });

  test("manual mode: approval card → edited plan → canvas results → model continues", async () => {
    const proposal = { aspectRatio: "3:4", modelKey: IMAGE_MODEL, size: "2K", tasks: [
      { prompt: "专业淘宝童装电商大片，3:4构图，墨绿羽绒服", title: "款式候选A·苔原墨绿" },
      { prompt: "专业淘宝童装电商大片，3:4构图，亮橘羽绒服", title: "款式候选B·落日亮橘" },
    ] };
    const { repository, runtime, service, session } = await setup([
      calls(["propose_generation", proposal, "call_gen"]),
      say("两款都出来了，A 更沉稳，B 更抢眼。"),
    ]);

    const first = await drive(await service.startMessage(ctx, session.id, { canvas, content: "先出两个款式候选" }));
    expect(ofType(first, "waiting")[0]).toMatchObject({ pending: { kind: "generation_approval", plan: { estimatedCredits: 2 * CREDITS_PER_IMAGE, modelKey: IMAGE_MODEL } } });

    // The user keeps only task B, switches to 1:1 and 3 images.
    const approved = await drive(await service.startResume(ctx, session.id, { callId: "call_gen", canvas, payload: { approved: true, overrides: { aspectRatio: "1:1", count: 3 }, taskIndexes: [1] } }));
    expect(runtime.requests).toHaveLength(1); // approving alone does not call the model
    expect(ofType(approved, "waiting")[0]).toMatchObject({ pending: { kind: "canvas_generate", plan: {
      estimatedCredits: 3 * CREDITS_PER_IMAGE, tasks: [{ aspectRatio: "1:1", count: 3, title: "款式候选B·落日亮橘" }],
    } } });

    const assetId = "22222222-2222-4222-8222-222222222222";
    const finished = await drive(await service.startResume(ctx, session.id, { callId: "call_gen", canvas, payload: { results: [
      { assetIds: [assetId], nodeIds: ["node-b"], status: "succeeded", taskIndex: 0 },
    ] } }));
    expect(finished.at(-1)).toEqual({ reason: "completed", type: "done" });
    expect(toolResult(runtime.requests[1]!.messages, "call_gen")).toMatchObject({ results: [{ assetIds: [assetId], status: "succeeded", title: "款式候选B·落日亮橘" }] });
    expect(repository.messages.get(session.id)!.filter((m) => m.toolCallId === "call_gen")).toHaveLength(1);
  });

  test("auto mode skips the approval card and applies defaults", async () => {
    const { service, session } = await setup([calls(["propose_generation", { modelKey: IMAGE_MODEL, tasks: [{ prompt: "主图", title: "主图1" }] }, "call_gen"])], { mode: "auto" });
    const events = await drive(await service.startMessage(ctx, session.id, { canvas, content: "直接出主图" }));
    expect(ofType(events, "waiting")[0]).toMatchObject({ pending: { kind: "canvas_generate", plan: { tasks: [{ aspectRatio: "1:1", count: 1, size: "2K" }] } } });
  });

  test("rejecting the card feeds the decision back to the model", async () => {
    const { runtime, service, session } = await setup([
      calls(["propose_generation", { modelKey: IMAGE_MODEL, tasks: [{ prompt: "主图", title: "主图1" }] }, "call_gen"]),
      say("好的，那我换个方向。"),
    ]);
    await drive(await service.startMessage(ctx, session.id, { canvas: null, content: "出图" }));
    const events = await drive(await service.startResume(ctx, session.id, { callId: "call_gen", canvas: null, payload: { approved: false, feedback: "颜色太暗" } }));
    expect(events.at(-1)).toEqual({ reason: "completed", type: "done" });
    expect(toolResult(runtime.requests[1]!.messages)).toEqual({ approved: false, feedback: "颜色太暗" });
  });

  test("invalid generation parameters come back as a tool error the model can fix", async () => {
    const { runtime, service, session } = await setup([
      calls(["propose_generation", { aspectRatio: "21:9", modelKey: IMAGE_MODEL, tasks: [{ prompt: "主图", title: "主图1" }] }]),
      say("该模型不支持 21:9，我改用 3:4。"),
    ]);
    const events = await drive(await service.startMessage(ctx, session.id, { canvas: null, content: "出一张宽屏图" }));
    expect(ofType(events, "waiting")).toHaveLength(0);
    expect(ofType(events, "tool_finished")[0]).toMatchObject({ name: "propose_generation", ok: false });
    const result = toolResult(runtime.requests[1]!.messages);
    expect(result.error).toBe("CANVAS_AGENT_GENERATION_INVALID");
    expect(result.message).toContain("3:4");
  });
  test("bad JSON, schema violations and unknown tools become tool errors, not crashes", async () => {
    const { runtime, service, session } = await setup([
      calls(["model_contract", "{not json", "c1"], ["model_contract", { modelKey: "" }, "c2"], ["teleport", {}, "c3"]),
      say("参数有误，我重新来。"),
    ]);
    const events = await drive(await service.startMessage(ctx, session.id, { canvas: null, content: "查参数" }));
    expect(ofType(events, "tool_started").map((e) => e.callId)).toEqual(["c1", "c2", "c3"]);
    expect(ofType(events, "tool_finished").map((e) => e.ok)).toEqual([false, false, false]);
    const sent = runtime.requests[1]!.messages;
    expect(toolResult(sent, "c1").error).toBe("INVALID_ARGUMENTS");
    expect(toolResult(sent, "c2").error).toBe("INVALID_ARGUMENTS");
    expect(toolResult(sent, "c3").error).toBe("TOOL_NOT_FOUND");
    expect(events.at(-1)).toEqual({ reason: "completed", type: "done" });
  });

  test("only one interaction per round: later calls in the same round are skipped", async () => {
    const { repository, service, session } = await setup([calls(["ask_user", oneQuestion, "c_ask"], ["canvas_inspect", {}, "c_late"])]);
    const events = await drive(await service.startMessage(ctx, session.id, { canvas, content: "开始" }));
    expect(ofType(events, "waiting")).toHaveLength(1);
    expect(JSON.parse(repository.messages.get(session.id)!.find((m) => m.toolCallId === "c_late")!.content).error).toBe("SKIPPED");
  });

  test("stop while waiting closes the open call and frees the session", async () => {
    const { repository, service, session } = await setup([calls(["ask_user", oneQuestion, "c_ask"])]);
    await drive(await service.startMessage(ctx, session.id, { canvas: null, content: "开始" }));
    expect(await service.stop(ctx, session.id)).toEqual({ stopped: true });
    expect(await repository.getSession(ctx, session.id)).toMatchObject({ pending: null, status: "idle" });
    expect(JSON.parse(repository.messages.get(session.id)!.find((m) => m.toolCallId === "c_ask")!.content).error).toBe("CANCELLED");
  });

  test("stop during a live run keeps the partial text and ends as cancelled", async () => {
    let stop: () => Promise<unknown> = async () => undefined;
    const { repository, service, session } = await setup([async () => {
      await stop();
      return [{ text: "我先看", type: "text_delta" }, ...calls(["canvas_inspect", {}])];
    }]);
    stop = () => service.stop(ctx, session.id);
    const events = await drive(await service.startMessage(ctx, session.id, { canvas: null, content: "开始" }));
    expect(events.at(-1)).toEqual({ reason: "cancelled", type: "done" });
    expect(await repository.getSession(ctx, session.id)).toMatchObject({ status: "idle" });
    const stored = repository.messages.get(session.id)!;
    expect(stored.at(-1)).toMatchObject({ content: "我先看", role: "assistant", toolCalls: null });
  });

  test("typing instead of answering supersedes the open card", async () => {
    const { repository, runtime, service, session } = await setup([calls(["ask_user", oneQuestion, "c_ask"]), say("好，按你说的来。")]);
    await drive(await service.startMessage(ctx, session.id, { canvas: null, content: "开始" }));
    const events = await drive(await service.startMessage(ctx, session.id, { canvas: null, content: "别问了，直接做" }));
    expect(events.at(-1)).toEqual({ reason: "completed", type: "done" });
    const sent = runtime.requests[1]!.messages;
    expect(toolResult(sent, "c_ask").error).toBe("SUPERSEDED");
    expect(sent.at(-1)).toEqual({ content: "别问了，直接做", role: "user" });
    expect(await repository.getSession(ctx, session.id)).toMatchObject({ pending: null, title: "开始" });
  });

  test("a running session rejects a second message until its lease goes stale", async () => {
    const { repository, service, session } = await setup([say("ok")]);
    await repository.updateSession(ctx, session.id, { status: "running" });
    await expect(service.startMessage(ctx, session.id, { canvas: null, content: "再来" })).rejects.toMatchObject({ code: "CANVAS_AGENT_BUSY", statusCode: 409 });
    expect(repository.messages.get(session.id)).toHaveLength(0);
    repository.sessions.get(session.id)!.touchedAt = Date.now() - 10 * 60_000;
    await expect(drive(await service.startMessage(ctx, session.id, { canvas: null, content: "再来" }))).resolves.toContainEqual({ reason: "completed", type: "done" });
  });

  test("a stale callId or a bad answer is rejected and the card stays open", async () => {
    const { repository, service, session } = await setup([calls(["ask_user", oneQuestion, "c_ask"])]);
    await drive(await service.startMessage(ctx, session.id, { canvas: null, content: "开始" }));
    await expect(service.startResume(ctx, session.id, { callId: "c_old", canvas: null, payload: { answers: [] } })).rejects.toMatchObject({ code: "CANVAS_AGENT_PENDING_MISMATCH" });
    await expect(service.startResume(ctx, session.id, { callId: "c_ask", canvas: null, payload: { answers: [{ optionIds: ["zzz"], questionId: "q" }] } })).rejects.toMatchObject({ code: "CANVAS_AGENT_ANSWER_INVALID", statusCode: 400 });
    expect(await repository.getSession(ctx, session.id)).toMatchObject({ pending: { callId: "c_ask" }, status: "waiting" });
  });

  test("a text route without tool calling is reported before anything changes", async () => {
    const { repository, runtime, service, session } = await setup([say("unused")]);
    runtime.getTextStreamingCapabilities = async () => { throw new AiGatewayError({ code: "AGENT_ROUTE_CAPABILITY_REQUIRED", message: "x", statusCode: 400 }); };
    await expect(service.startMessage(ctx, session.id, { canvas: null, content: "你好" })).rejects.toMatchObject({ code: "CANVAS_AGENT_ROUTE_NOT_ENABLED", statusCode: 503 });
    expect(await repository.getSession(ctx, session.id)).toMatchObject({ status: "idle" });
    expect(repository.messages.get(session.id)).toHaveLength(0);
  });

  test("the round limit stops a runaway tool loop with a friendly message", async () => {
    const { repository, service, session } = await setup([calls(["canvas_inspect", {}, "r1"]), calls(["canvas_inspect", {}, "r2"])], { maxRounds: 2 });
    const events = await drive(await service.startMessage(ctx, session.id, { canvas, content: "开始" }));
    expect(ofType(events, "error")[0]).toMatchObject({ code: "CANVAS_AGENT_ROUND_LIMIT" });
    expect(events.at(-1)).toEqual({ reason: "round_limit", type: "done" });
    expect((await repository.getSession(ctx, session.id)).status).toBe("idle");
  });

  test("a model error ends the run and frees the session", async () => {
    const { repository, service, session } = await setup([[{ error: { code: "PROVIDER_TIMEOUT", message: "upstream timed out" }, type: "error" }]]);
    const events = await drive(await service.startMessage(ctx, session.id, { canvas: null, content: "你好" }));
    expect(ofType(events, "error")[0]).toMatchObject({ code: "CANVAS_AGENT_MODEL_ERROR" });
    expect(events.at(-1)).toEqual({ reason: "completed", type: "done" });
    expect((await repository.getSession(ctx, session.id)).status).toBe("idle");
  });

  test("file_write stores project.md, emits file_updated and lists it in the next prompt", async () => {
    const { repository, runtime, service, session } = await setup([
      calls(["file_write", { content: "# 小王子羽绒服\n## 交付清单", path: "project.md" }]),
      say("已写好 project.md。"),
    ]);
    const events = await drive(await service.startMessage(ctx, session.id, { canvas: null, content: "写项目文件" }));
    expect(ofType(events, "file_updated")[0]).toEqual({ path: "project.md", type: "file_updated", version: 1 });
    expect((await repository.listFiles(ctx, session.flowId))[0]).toMatchObject({ content: "# 小王子羽绒服\n## 交付清单", path: "project.md" });
    expect(runtime.requests[1]!.messages[0]!.content).toContain("project.md（v1）");
  });

  test("asset_save needs asset:update", async () => {
    const assetId = "33333333-3333-4333-8333-333333333333";
    const { deps, runtime, service, session } = await setup([calls(["asset_save", { assetIds: [assetId], folderName: "小王子羽绒服" }]), say("没有权限。")]);
    const limited = { ...ctx, permissions: ["flow:read", "flow:update"] };
    await drive(await service.startMessage(limited, session.id, { canvas: null, content: "存一下" }));
    expect(toolResult(runtime.requests[1]!.messages).error).toBe("PERMISSION_DENIED");
    expect(deps.savedToFolder).toHaveLength(0);
  });
});

describe("buildModelMessages", () => {
  const base = { createdAt: "", display: null, id: "", seq: 0, toolCallId: null, toolCalls: null, toolName: null };
  test("fills in missing tool results and drops orphan results", () => {
    const messages = buildModelMessages("SYS", [
      { ...base, content: "开始", role: "user" },
      { ...base, content: "", role: "assistant", toolCalls: [{ arguments: "{}", callId: "a", name: "canvas_inspect" }] },
      { ...base, content: "{}", role: "tool", toolCallId: "ghost", toolName: "x" },
      { ...base, content: "继续", role: "user" },
    ]);
    expect(messages.map((m) => [m.role, m.toolCallId ?? null])).toEqual([["system", null], ["user", null], ["assistant", null], ["tool", "a"], ["user", null]]);
    expect(JSON.parse(messages[3]!.content).error).toBe("NO_RESULT");
  });
});
