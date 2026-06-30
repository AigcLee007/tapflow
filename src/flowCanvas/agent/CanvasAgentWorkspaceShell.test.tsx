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
    expect(screen.getByRole("button", { name: "New chat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse Agent" })).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Connections" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Logs" })).toBeNull();
    expect(screen.getByTestId("agent-shell-utility-nav")).toBeTruthy();
    expect(screen.getByTestId("agent-shell-composer-dock")).toBeTruthy();

    const shell = container.firstElementChild as HTMLElement | null;
    expect(shell).toBeTruthy();
    expect(shell?.style.top).toBe("16px");
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

    fireEvent.click(screen.getByRole("button", { name: "Collapse Agent" }));

    expect(onCollapse).toHaveBeenCalled();
  });
});
