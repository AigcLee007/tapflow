import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentHistoryView } from "./CanvasAgentHistoryView";

describe("CanvasAgentHistoryView", () => {
  it("shows empty state when no sessions exist", () => {
    render(
      <CanvasAgentHistoryView
        activeSessionId={null}
        onNewChat={vi.fn()}
        onOpenSession={vi.fn()}
        sessions={[]}
      />,
    );

    expect(screen.getByText("当前项目下还没有 Agent 对话历史，可以直接开启新的生产对话。")).toBeTruthy();
  });

  it("opens a selected session", () => {
    const onOpenSession = vi.fn();
    render(
      <CanvasAgentHistoryView
        activeSessionId={null}
        onNewChat={vi.fn()}
        onOpenSession={onOpenSession}
        sessions={[
          {
            createdAt: "2026-06-26T10:00:00Z",
            flowId: "flow-1",
            id: "session-1",
            projectId: "project-1",
            title: "动物海报生产",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /动物海报生产/ }));

    expect(onOpenSession).toHaveBeenCalledWith("session-1");
  });
});
