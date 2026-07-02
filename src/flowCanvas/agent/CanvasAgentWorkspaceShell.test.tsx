import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentWorkspaceShell } from "./CanvasAgentWorkspaceShell";

describe("CanvasAgentWorkspaceShell", () => {
  it("renders as a docked canvas copilot shell with compact utility actions", () => {
    const { container } = render(
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
    expect(screen.getByText("Canvas Copilot")).toBeTruthy();
    expect(screen.getByRole("button", { name: "新对话" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "收起 Agent" })).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Connections" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Logs" })).toBeNull();
    expect(screen.getByTestId("agent-shell-toolbar")).toBeTruthy();
    expect(screen.getByTestId("agent-shell-composer-dock")).toBeTruthy();

    const shell = container.firstElementChild as HTMLElement | null;
    expect(shell).toBeTruthy();
    expect(shell?.style.top).toBe("16px");
  });

  it("renders hand-drawn toolbar order: logs, chat, history, new chat, collapse", () => {
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

    const toolbar = screen.getByTestId("agent-shell-toolbar");
    expect(
      Array.from(toolbar.querySelectorAll("button")).map((button) => button.getAttribute("aria-label")),
    ).toEqual(["日志", "对话", "历史", "新对话", "收起 Agent"]);
    expect(screen.queryByRole("button", { name: "Connections" })).toBeNull();
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
