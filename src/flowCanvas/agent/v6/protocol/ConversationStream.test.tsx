import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConversationStream, type AgentV6StreamBlock } from "./ConversationStream";
import type { AgentBlockAction } from "./BlockRenderer";

const blocks: AgentV6StreamBlock[] = [
  { type: "understanding", title: "我先理解一下", text: "你希望做一个可编辑的方案。" },
  { type: "question", id: "audience", title: "目标人群", prompt: "请选择目标人群", options: ["儿童", "成人"] },
  { type: "heading", level: 2, text: "方向建议" },
  { type: "paragraph", text: "普通文本保持轻量消息流。" },
  {
    type: "choice_grid",
    id: "direction",
    title: "选择方向",
    selectionMode: "multiple",
    selectedOptionIds: ["a"],
    options: [
      { id: "a", label: "陪伴", description: "温和、持续" },
      { id: "b", label: "探索", description: "开放、好奇" },
    ],
  },
  {
    type: "comparison_table",
    title: "方案对比",
    columns: ["方案", "范围", "风险"],
    rows: [["A", "小范围", "低"]],
  },
  {
    type: "brief_card",
    id: "brief-1",
    title: "共创 Brief",
    editable: true,
    fields: [{ label: "目标", value: "陪伴儿童" }],
  },
  {
    type: "confirmation_card",
    id: "confirm-1",
    title: "准备执行",
    text: "确认后开始生成。",
    plan: { costCredits: 12, summary: "写入当前画布", writesCanvas: true, batch: true },
  },
  {
    type: "progress_card",
    id: "progress-1",
    title: "正在执行",
    steps: [
      { id: "one", label: "准备素材", status: "completed" },
      { id: "two", label: "生成结果", status: "running", detail: "预计还需片刻" },
    ],
  },
  {
    type: "result_group",
    id: "results-1",
    title: "生成结果",
    results: [{ id: "result-1", label: "方案 A", assetId: "asset-1" }],
  },
];

describe("ConversationStream", () => {
  it("renders text, understanding, questions, and structured blocks without legacy cards", () => {
    render(<ConversationStream blocks={blocks} onAction={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "方向建议" })).toBeTruthy();
    expect(screen.getByText("普通文本保持轻量消息流。")).toBeTruthy();
    expect(screen.getByRole("region", { name: "我先理解一下" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "目标人群" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "方案对比" })).toBeTruthy();
    expect(document.querySelector(".agent-v5-card")).toBeNull();
  });

  it("emits typed choice, question, brief, confirmation, progress, and result actions", () => {
    const onAction = vi.fn<(action: AgentBlockAction) => void>();
    render(<ConversationStream blocks={blocks} onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: /探索/ }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "select_choice", blockId: "direction", optionIds: ["a", "b"] });

    fireEvent.click(screen.getByRole("button", { name: "儿童" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "answer_question", blockId: "audience", value: "儿童" });

    fireEvent.click(screen.getByRole("button", { name: "编辑 Brief" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "edit_brief", blockId: "brief-1" });
    fireEvent.click(screen.getByRole("button", { name: "提交 Brief" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "submit_brief", blockId: "brief-1", fields: [{ label: "目标", value: "陪伴儿童" }] });
    fireEvent.click(screen.getByRole("button", { name: "修改 Brief" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "revise_brief", blockId: "brief-1" });

    expect(screen.getByText("12 积分")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "准备执行" })).getByText("写入当前画布")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认并执行" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "confirm_execution", blockId: "confirm-1" });
    fireEvent.click(screen.getByRole("button", { name: "修改计划" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "revise_plan", blockId: "confirm-1" });

    expect(screen.getByRole("region", { name: "生成结果" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "选择方案 A" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "select_result", resultId: "result-1" });
    fireEvent.click(screen.getByRole("button", { name: "预览方案 A" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "preview_result", resultId: "result-1" });
    fireEvent.click(screen.getByRole("button", { name: "继续编辑方案 A" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "refine_result", resultId: "result-1" });
    fireEvent.click(screen.getByRole("button", { name: "生成方案 A的变体" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "variant_result", resultId: "result-1" });
    fireEvent.click(screen.getByRole("button", { name: "设置方案 A为参考" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "set_reference", resultId: "result-1" });
    fireEvent.click(screen.getByRole("button", { name: "放入画布方案 A" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "place_result", resultId: "result-1" });
  });

  it("supports locked choices, keyboard access, progress states, and safe table overflow", () => {
    const onAction = vi.fn();
    render(
      <ConversationStream
        blocks={[
          { type: "choice_grid", id: "locked", selectionMode: "single", locked: true, options: [{ id: "x", label: "已锁定" }] },
          { type: "progress_card", id: "failed-progress", steps: [{ id: "failed", label: "失败步骤", status: "failed", detail: "可重试" }] },
          { type: "comparison_table", title: "宽表", columns: ["一", "二"], rows: [["很长的内容", "更多内容"]] },
        ] as AgentV6StreamBlock[]}
        onAction={onAction}
      />,
    );

    const locked = screen.getByRole("button", { name: "已锁定" });
    expect((locked as HTMLButtonElement).disabled).toBe(true);
    expect(locked.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("失败步骤").closest("li")?.getAttribute("data-status")).toBe("failed");
    expect(document.querySelector(".agent-v6-table-scroll")).toBeTruthy();
    expect(screen.getByRole("button", { name: "已锁定" }).tabIndex).toBe(0);
    expect(within(screen.getByRole("table", { name: "宽表" })).getByText("更多内容")).toBeTruthy();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("does not render unsafe provider or HTML fields", () => {
    render(
      <ConversationStream
        blocks={[{ type: "paragraph", text: "安全文本", provider: "secret-provider", html: "<script>bad()</script>" } as AgentV6StreamBlock]}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText("安全文本")).toBeTruthy();
    expect(screen.queryByText("secret-provider")).toBeNull();
    expect(screen.queryByText("bad()", { exact: false })).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });
});
