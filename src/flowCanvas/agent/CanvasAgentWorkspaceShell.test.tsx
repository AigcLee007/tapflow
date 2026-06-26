import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentWorkspaceShell } from "./CanvasAgentWorkspaceShell";

describe("CanvasAgentWorkspaceShell", () => {
  it("renders as a docked Agent workspace with header actions", () => {
    render(
      <CanvasAgentWorkspaceShell
        activeTab="chat"
        busy={false}
        onChangeTab={vi.fn()}
        onCollapse={vi.fn()}
        onNewChat={vi.fn()}
      >
        <div>Body</div>
      </CanvasAgentWorkspaceShell>,
    );

    expect(screen.getByText("TapFlow Agent")).toBeTruthy();
    expect(screen.getByText("Canvas Director")).toBeTruthy();
    expect(screen.getByRole("button", { name: "新对话" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "收起 Agent" })).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("collapses when collapse button is clicked", () => {
    const onCollapse = vi.fn();
    render(
      <CanvasAgentWorkspaceShell
        activeTab="chat"
        busy={false}
        onChangeTab={vi.fn()}
        onCollapse={onCollapse}
        onNewChat={vi.fn()}
      >
        <div>Body</div>
      </CanvasAgentWorkspaceShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "收起 Agent" }));

    expect(onCollapse).toHaveBeenCalled();
  });
});
