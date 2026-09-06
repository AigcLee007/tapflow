import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentWindow } from "./AgentWindow";

describe("AgentWindow", () => {
  it("renders TapNow window controls and a fixed bottom composer", () => {
    render(<AgentWindow models={[{ key: "default", label: "默认文本模型" }]} />);
    expect(screen.getByRole("button", { name: "新建对话" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "聊天记录" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "收起 Agent" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "添加附件" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "语音输入" })).toBeNull();
    expect(screen.queryByText("用量统计")).toBeNull();
  });

  it("opens history and attachment menus", () => {
    const onAttachmentAction = vi.fn();
    render(<AgentWindow onAttachmentAction={onAttachmentAction} sessions={[{ id: "s1", title: "儿童陪伴玩具" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "聊天记录" }));
    expect(screen.getByText("儿童陪伴玩具")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "添加附件" }));
    expect(screen.getByRole("button", { name: "从画布选择" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "上传附件" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skill" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "App" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skill" }));
    expect(onAttachmentAction).toHaveBeenCalledWith("skill");
  });

  it("sends text with the selected model and toggles execution mode", () => {
    const onSend = vi.fn();
    const onChangeMode = vi.fn();
    render(<AgentWindow blocks={[{ type: "paragraph", text: "已有上下文" }]} models={[{ key: "fast", label: "快速模型" }]} onChangeMode={onChangeMode} onSend={onSend} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Agent 输入" }), { target: { value: "设计儿童玩具" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(onSend).toHaveBeenCalledWith("设计儿童玩具", "fast");
    fireEvent.click(screen.getByRole("button", { name: "用户确认模式" }));
    expect(onChangeMode).toHaveBeenCalledWith("auto");
  });

  it("asks before forwarding an ambiguous first request, then sends only after Brief confirmation", () => {
    const onSend = vi.fn();
    render(<AgentWindow onSend={onSend} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Agent 输入" }), { target: { value: "根据小黄人设计儿童陪伴玩具" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText("你更想优先解决哪件事？")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "陪伴与情绪安抚" }));
    fireEvent.click(screen.getByRole("button", { name: "3-6 岁" }));
    expect(screen.getByText("共创 Brief")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认并开始设计" }));
    expect(onSend).toHaveBeenCalledWith(expect.stringContaining("陪伴与情绪安抚"), null);
  });
});
