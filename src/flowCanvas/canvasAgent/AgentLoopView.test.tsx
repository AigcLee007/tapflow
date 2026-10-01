import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AgentLoopView } from "./AgentLoopView";
import type { TranscriptItem } from "./canvasAgentTranscript";
import type { CanvasAgentImageModel } from "./canvasAgentTypes";
import type { CanvasAgentController } from "./useCanvasAgent";

function fakeAgent(overrides: Partial<CanvasAgentController> = {}): CanvasAgentController {
  return {
    answerQuestions: vi.fn(async () => undefined), busy: false, decideGeneration: vi.fn(async () => undefined), files: [], history: [],
    items: [], mode: "manual", newConversation: vi.fn(), openSession: vi.fn(async () => undefined), phase: "idle",
    refreshFiles: vi.fn(async () => undefined), rename: vi.fn(async () => undefined), reportGeneration: vi.fn(async () => undefined),
    send: vi.fn(async () => undefined), session: null, setMode: vi.fn(async () => undefined), startedAt: null, stop: vi.fn(async () => undefined),
    ...overrides,
  };
}

const models: CanvasAgentImageModel[] = [{
  aspectRatios: ["1:1", "3:4"], defaultRouteKey: "r1", displayName: "Seedream 5.0 Pro", modelKey: "seedream-5-pro", quantityOptions: [1, 2, 3],
  routes: [{ estimatedCredits: 6, routeKey: "r1", routeLabel: "线路一", sizes: [{ credits: 4, size: "1K" }, { credits: 6, size: "2K" }, { credits: 9, size: "4K" }] }],
  sizes: ["1K", "2K", "4K"],
}];

const view = (agent: CanvasAgentController) => render(<AgentLoopView agent={agent} flowId="flow-1" models={models} selectedCount={0} onClose={vi.fn()} />);

describe("AgentLoopView", () => {
  test("sends with Enter, keeps Shift+Enter and IME composition from sending", () => {
    const agent = fakeAgent();
    view(agent);
    fireEvent.click(screen.getByRole("button", { name: /男童羽绒服/ }));
    const input = screen.getByRole("textbox", { name: "Agent 输入" });
    expect((input as HTMLTextAreaElement).value).toContain("男童羽绒服");

    fireEvent.keyDown(input, { isComposing: true, key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(agent.send).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(agent.send).toHaveBeenCalledWith(expect.stringContaining("男童羽绒服"));
  });

  test("renders tool steps and the live status line", () => {
    const items: TranscriptItem[] = [
      { id: "u", kind: "user", text: "做详情页" },
      { id: "s", kind: "steps", steps: [
        { callId: "a", durationMs: 1200, name: "canvas_inspect", status: "ok", summary: "3 个节点", title: "查看当前画布节点与素材" },
        { callId: "b", name: "file_write", status: "ok", summary: "已编辑 project.md", title: "编辑 project.md" },
      ] },
    ];
    view(fakeAgent({ busy: true, items, phase: "thinking", startedAt: Date.now() - 3000 }));
    expect(screen.getByRole("button", { name: /已完成 2 个操作/ })).toBeTruthy();
    expect(screen.getByText("已编辑 project.md")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("思考中");
    expect(screen.getByRole("button", { name: "停止" })).toBeTruthy();
  });

  test("question wizard: recommended option preselected, next, free text, submit", () => {
    const agent = fakeAgent({ items: [{ callId: "c_ask", id: "card", kind: "questions", state: "open", questions: [
      { allowFreeText: true, id: "material", options: [{ id: "ai", label: "全套AI概念生成", recommended: true }, { id: "upload", label: "我有实物照片" }], prompt: "是否有实物照片？", selection: "single", tag: "素材现状" },
      { allowFreeText: true, id: "style", options: [{ id: "mountain", label: "山系机能探索风" }], prompt: "视觉风格？", selection: "single", tag: "风格定位" },
    ] }] });
    view(agent);
    const card = screen.getByRole("region", { name: "需要你确认" });
    expect(within(card).getByText("1/2")).toBeTruthy();
    expect(within(card).getByRole("button", { name: /全套AI概念生成/ }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(within(card).getByRole("button", { name: "下一题" }));
    fireEvent.change(within(card).getByRole("textbox", { name: /视觉风格/ }), { target: { value: "山系但更活泼" } });
    fireEvent.click(within(card).getByRole("button", { name: "提交" }));
    expect(agent.answerQuestions).toHaveBeenCalledWith("c_ask", expect.any(Array), { answers: [
      { optionIds: ["ai"], questionId: "material" }, { questionId: "style", text: "山系但更活泼" },
    ] });
  });

  test("generation card: remove a task, change ratio, live estimate, confirm sends only the changes", () => {
    const plan = { estimatedCredits: 12, modelKey: "seedream-5-pro", routeKey: "r1", tasks: [
      { aspectRatio: "3:4", count: 1, prompt: "墨绿", referenceAssetIds: [], size: "2K" as const, title: "款式候选A·苔原墨绿" },
      { aspectRatio: "3:4", count: 1, prompt: "亮橘", referenceAssetIds: [], size: "2K" as const, title: "款式候选B·落日亮橘" },
    ] };
    const agent = fakeAgent({ items: [{ callId: "g", id: "card", kind: "generation", plan, state: "approval" }] });
    view(agent);
    const card = screen.getByRole("region", { name: "图片生成确认" });
    expect(within(card).getByText("~12 积分")).toBeTruthy();

    fireEvent.click(within(card).getByRole("button", { name: "移除 款式候选A·苔原墨绿" }));
    expect(within(card).getByText("~6 积分")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "画面比例 3:4" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "1:1" }));
    fireEvent.click(within(card).getByRole("button", { name: "确认" }));
    expect(agent.decideGeneration).toHaveBeenCalledWith("g", { approved: true, overrides: { aspectRatio: "1:1" }, taskIndexes: [1] });
  });

  test("an approved batch waits for the canvas executor until phase 3 wires it", () => {
    const plan = { estimatedCredits: 6, modelKey: "seedream-5-pro", routeKey: "r1", tasks: [{ aspectRatio: "1:1", count: 1, prompt: "p", referenceAssetIds: [], size: "2K" as const, title: "主图1" }] };
    view(fakeAgent({ items: [{ callId: "g", id: "card", kind: "generation", plan, state: "generating" }] }));
    expect(screen.getByText(/等待画布执行/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "确认" })).toBeNull();
  });

  test("mode menu switches between manual confirmation and auto generation", () => {
    const agent = fakeAgent();
    view(agent);
    fireEvent.click(screen.getByRole("button", { name: "执行模式：手动确认" }));
    act(() => { fireEvent.click(screen.getByRole("menuitemradio", { name: /自动生成/ })); });
    expect(agent.setMode).toHaveBeenCalledWith("auto");
  });
});
