import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentV4Workspace } from "./CanvasAgentV4Workspace";

describe("CanvasAgentV4Workspace", () => {
  it("keeps an ambiguous first request in discovery instead of executing it", () => {
    const onExecute = vi.fn();
    render(<CanvasAgentV4Workspace onExecute={onExecute} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Agent 任务" }), {
      target: { value: "根据这张小黄人图片设计一款儿童陪伴玩具" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始共创" }));

    expect(screen.getByText("先把方向定清楚")).toBeTruthy();
    expect(screen.getByText("你更想优先解决哪件事？")).toBeTruthy();
    expect(onExecute).not.toHaveBeenCalled();
  });

  it("builds a brief, then requires explicit confirmation before execution", () => {
    const onExecute = vi.fn();
    render(<CanvasAgentV4Workspace onExecute={onExecute} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Agent 任务" }), {
      target: { value: "设计儿童陪伴玩具" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始共创" }));
    fireEvent.click(screen.getByRole("button", { name: "陪伴与情绪安抚" }));
    fireEvent.click(screen.getByRole("button", { name: "3-6 岁" }));

    expect(screen.getByText("共创 Brief")).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认并开始设计" })).toBeTruthy();
    expect(onExecute).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认并开始设计" }));
    expect(onExecute).toHaveBeenCalledWith(expect.stringContaining("陪伴与情绪安抚"));
  });
});
