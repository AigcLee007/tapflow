import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationBlockRenderer } from "./ConversationBlockRenderer";

describe("ConversationBlockRenderer", () => {
  it("renders structured blocks and emits option action", async () => {
    const onAction = vi.fn();
    render(<ConversationBlockRenderer onAction={onAction} blocks={[{ type: "question", text: "年龄？", options: [{ id: "a", label: "3-5 岁" }] }, { type: "brief", fields: [{ label: "产品", value: "陪伴玩具" }] }, { type: "comparison", columns: ["方向", "体验"], rows: [{ label: "A", values: ["毛绒", "安抚"] }] }]} />);
    expect(screen.getByText("年龄？")).toBeTruthy();
    expect(screen.getByText("产品")).toBeTruthy();
    expect(screen.getByText("体验")).toBeTruthy();
    screen.getByRole("button", { name: "3-5 岁" }).click();
    expect(onAction).toHaveBeenCalledWith({ type: "select", id: "a", value: "single" });
  });

  it("renders confirmation and result actions", () => {
    const onAction = vi.fn();
    render(<ConversationBlockRenderer onAction={onAction} blocks={[{ type: "confirmation", text: "开始生成", costCredits: 12 }, { type: "results", results: [{ id: "r1", label: "方向一" }] }]} />);
    screen.getByRole("button", { name: "确认执行" }).click();
    screen.getByRole("button", { name: /方向一/ }).click();
    expect(onAction).toHaveBeenCalledWith({ type: "confirm" });
    expect(onAction).toHaveBeenCalledWith({ type: "result", id: "r1" });
  });

  it("offers a refine action for each result", () => {
    const onAction = vi.fn();
    render(<ConversationBlockRenderer onAction={onAction} blocks={[{ type: "results", results: [{ id: "r2", label: "方向二" }] }]} />);
    screen.getByRole("button", { name: "继续编辑" }).click();
    expect(onAction).toHaveBeenCalledWith({ type: "result", id: "r2", value: "refine" });
  });
});
