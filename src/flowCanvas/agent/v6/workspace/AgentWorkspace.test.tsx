import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentWorkspace, type AgentWorkspaceHistoryItem, type AgentWorkspaceReference } from "./AgentWorkspace";

const history: AgentWorkspaceHistoryItem[] = [
  { id: "today-1", title: "今日方案", summary: "整理首页视觉方向", date: "2026-09-09", selected: true },
  { id: "yesterday-1", title: "昨日草稿", summary: "补充素材引用", date: "2026-09-08" },
];

const references: AgentWorkspaceReference[] = [
  { id: "ref-1", label: "首页节点" },
  { id: "ref-2", label: "参考图" },
];

function renderWorkspace(overrides: Partial<React.ComponentProps<typeof AgentWorkspace>> = {}) {
  return render(
    <AgentWorkspace
      blocks={[{ type: "paragraph", text: "先确认视觉方向。" }]}
      history={history}
      historyNow={new Date("2026-09-09T12:00:00")}
      model="tapflow-fast"
      modelOptions={[{ label: "TapFlow Fast", value: "tapflow-fast" }, { label: "TapFlow Pro", value: "tapflow-pro" }]}
      onCancel={vi.fn()}
      onCapability={vi.fn()}
      onHistorySelect={vi.fn()}
      onNewConversation={vi.fn()}
      onPromptChange={vi.fn()}
      onRemoveReference={vi.fn()}
      onRename={vi.fn()}
      onSend={vi.fn()}
      phase="understanding"
      prompt=""
      references={references}
      title="新建对话"
      {...overrides}
    />,
  );
}

describe("AgentWorkspace", () => {
  it("renders a responsive right workspace with an independently scrolling conversation and fixed composer", () => {
    renderWorkspace();

    const workspace = screen.getByTestId("agent-v6-workspace");
    expect(workspace.className).toContain("agent-v6-workspace");
    expect(workspace.className).toContain("agent-v6-workspace-responsive");
    expect(screen.getByTestId("agent-v6-message-stream").className).toContain("agent-v6-message-stream");
    expect(screen.getByTestId("agent-v6-composer").className).toContain("agent-v6-composer-fixed");
    expect(screen.getByText("先确认视觉方向。")).toBeTruthy();
    expect(screen.queryByText("Timeline")).toBeNull();
    expect(screen.queryByText("SkillBar")).toBeNull();
  });

  it("supports header actions and local title editing", () => {
    const onNewConversation = vi.fn();
    const onRename = vi.fn();
    const onCollapse = vi.fn();
    renderWorkspace({ onCollapse, onNewConversation, onRename });

    fireEvent.click(screen.getByRole("button", { name: "新建对话" }));
    expect(onNewConversation).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "重命名" }));
    fireEvent.change(screen.getByLabelText("对话标题"), { target: { value: "新标题" } });
    fireEvent.click(screen.getByRole("button", { name: "保存标题" }));
    expect(onRename).toHaveBeenCalledWith("新标题");

    fireEvent.click(screen.getByRole("button", { name: "收起 Agent" }));
    expect(onCollapse).toHaveBeenCalledOnce();
  });

  it("opens history, groups sessions by date, selects a session, and shows empty/loading states", () => {
    const onHistorySelect = vi.fn();
    renderWorkspace({ onHistorySelect });

    fireEvent.click(screen.getByRole("button", { name: "历史" }));
    expect(screen.getByRole("complementary", { name: "对话历史" })).toBeTruthy();
    expect(screen.getByText("今天")).toBeTruthy();
    expect(screen.getByText("昨天")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /昨日草稿/ }));
    expect(onHistorySelect).toHaveBeenCalledWith("yesterday-1");

    cleanup();
    renderWorkspace({ history: [], historyLoading: false });
    fireEvent.click(screen.getByRole("button", { name: "历史" }));
    expect(screen.getByText("暂无对话历史")).toBeTruthy();
    cleanup();
    renderWorkspace({ history: [], historyLoading: true });
    fireEvent.click(screen.getByRole("button", { name: "历史" }));
    expect(screen.getByText("正在加载历史...")).toBeTruthy();
  });

  it("keeps composer controls in order, disables blank sends, and emits a busy cancel", () => {
    const onSend = vi.fn();
    const onCancel = vi.fn();
    renderWorkspace({ onCancel, onSend, prompt: "   " });

    const composer = screen.getByTestId("agent-v6-composer");
    const order = Array.from(composer.querySelectorAll("[data-composer-slot]"), (node) => node.getAttribute("data-composer-slot"));
    expect(order).toEqual(["capability", "mode", "input", "model", "send"]);
    expect((screen.getByRole("button", { name: "发送" }) as HTMLButtonElement).disabled).toBe(true);

    cleanup();
    renderWorkspace({ busy: true, onCancel, onSend, prompt: "执行这个" });
    fireEvent.click(screen.getByRole("button", { name: "取消执行" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("sends prompt, switches mode, changes model, and removes reference chips", () => {
    const onSend = vi.fn();
    const onModeChange = vi.fn();
    const onModelChange = vi.fn();
    const onRemoveReference = vi.fn();
    renderWorkspace({ onModeChange, onModelChange, onRemoveReference, onSend, prompt: "做一个首页" });

    fireEvent.click(screen.getByRole("button", { name: /执行模式/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /用户确认/ }));
    expect(onModeChange).toHaveBeenCalledWith("manual_confirmation");
    fireEvent.click(screen.getByRole("button", { name: /TapFlow Fast/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "TapFlow Pro" }));
    expect(onModelChange).toHaveBeenCalledWith("tapflow-pro");
    fireEvent.click(screen.getByRole("button", { name: "移除首页节点引用" }));
    expect(onRemoveReference).toHaveBeenCalledWith("ref-1");
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(onSend).toHaveBeenCalledWith("做一个首页");
  });

  it("closes capability menus on escape, outside click, and when another menu opens", () => {
    const onCapability = vi.fn();
    renderWorkspace({ onCapability });

    fireEvent.click(screen.getByRole("button", { name: "添加能力" }));
    expect(screen.getByRole("menu", { name: "Agent 能力" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: /^画布/ }));
    expect(onCapability).toHaveBeenCalledWith("canvas");
    expect(screen.queryByRole("menu", { name: "Agent 能力" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "添加能力" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Agent 能力" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "添加能力" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu", { name: "Agent 能力" })).toBeNull();
  });

  it("keeps history, capability, mode, and model layers mutually exclusive", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "历史" }));
    expect(screen.getByRole("complementary", { name: "对话历史" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "执行模式 Agent 自动执行" }));
    expect(screen.queryByRole("complementary", { name: "对话历史" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "用户确认" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "模型 TapFlow Fast" }));
    expect(screen.queryByRole("menuitem", { name: "用户确认" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "TapFlow Pro" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "添加能力" }));
    expect(screen.queryByRole("menuitem", { name: "TapFlow Pro" })).toBeNull();
    expect(screen.getByRole("menu", { name: "Agent 能力" })).toBeTruthy();
  });
});
