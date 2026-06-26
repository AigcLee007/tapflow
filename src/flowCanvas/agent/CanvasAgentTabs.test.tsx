import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentTabs } from "./CanvasAgentTabs";

describe("CanvasAgentTabs", () => {
  it("renders the four Agent workspace tabs", () => {
    render(<CanvasAgentTabs activeTab="chat" onChange={vi.fn()} />);

    expect(screen.getByRole("tab", { name: "对话" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "历史" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "连接配置" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "日志" })).toBeTruthy();
  });

  it("notifies when a tab is selected", () => {
    const onChange = vi.fn();
    render(<CanvasAgentTabs activeTab="chat" onChange={onChange} />);

    fireEvent.click(screen.getByRole("tab", { name: "历史" }));

    expect(onChange).toHaveBeenCalledWith("history");
  });
});
