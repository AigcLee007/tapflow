import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentConversationStream } from "./AgentConversationStream";
import type { ConversationBlock } from "./agentV5Types";

const fixtureBlocks: ConversationBlock[] = [
  { type: "heading", level: 2, text: "我对你的需求理解" },
  { type: "bullet_list", items: ["面向 3–6 岁儿童", "保留角色识别度"] },
  { type: "comparison_table", title: "方向比较", columns: ["方向", "核心体验"], rows: [["陪伴", "情绪安抚"]] },
  { type: "choice_grid", id: "direction", title: "选择方向", selectionMode: "single", options: [{ id: "comfort", label: "陪伴与情绪安抚", description: "让孩子获得安定感" }] },
  { type: "brief_card", title: "共创 Brief", editable: true, fields: [{ label: "目标", value: "儿童陪伴玩具" }] },
  { type: "confirmation_card", title: "准备开始设计", text: "确认后执行", plan: { costCredits: 12, writesCanvas: true } },
  { type: "progress_card", title: "正在执行儿童产品概念设计", steps: [{ id: "one", label: "分析参考图", status: "completed" }] },
  { type: "result_group", title: "已完成 3 个设计方向", results: [{ id: "result-1", label: "方向 1", assetId: "asset-1" }] },
];

describe("AgentConversationStream", () => {
  it("renders structured text and product blocks as separate semantic surfaces", () => {
    render(<AgentConversationStream blocks={fixtureBlocks} onAction={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "我对你的需求理解" })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("button", { name: "陪伴与情绪安抚" })).toBeTruthy();
    expect(screen.getByText("共创 Brief")).toBeTruthy();
    expect(screen.getByText("预计消耗：12 积分")).toBeTruthy();
    expect(screen.getByText("正在执行儿童产品概念设计")).toBeTruthy();
  });

  it("emits structured actions instead of calling an API inside the renderer", () => {
    const onAction = vi.fn();
    render(<AgentConversationStream blocks={fixtureBlocks} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "陪伴与情绪安抚" }));
    expect(onAction).toHaveBeenCalledWith({ type: "select_choice", blockId: "direction", optionId: "comfort" });
  });
});
