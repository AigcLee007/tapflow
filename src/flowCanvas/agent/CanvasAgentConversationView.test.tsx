import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentConversationView } from "./CanvasAgentConversationView";

describe("CanvasAgentConversationView", () => {
  it("renders a sparse empty copilot state", () => {
    render(
      <CanvasAgentConversationView
        busy={false}
        items={[]}
        onApprove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId("agent-conversation-empty-state")).toBeTruthy();
    expect(screen.getByText("告诉 Agent 你想在画布上完成什么。")).toBeTruthy();
    expect(screen.queryByText("One canvas, every production step")).toBeNull();
    expect(document.body.textContent).not.toMatch(/[锟閸檤]/);
  });

  it("keeps the chat stream compact and free of raw replay debug blocks", () => {
    render(<CanvasAgentConversationView busy={false} items={[]} />);

    expect(screen.getByText("告诉 Agent 你想在画布上完成什么。")).toBeTruthy();
    expect(screen.queryByText("Replay Events")).toBeNull();
    expect(document.body.textContent).not.toMatch(/[锟閸檤]/);
  });

  it("renders timeline messages and statuses", () => {
    render(
      <CanvasAgentConversationView
        busy={false}
        items={[
          { content: "Help me make a poster", id: "m1", kind: "message", role: "user" },
          { id: "s1", kind: "status", state: "active", title: "Reading the selected canvas context" },
        ]}
        onApprove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Help me make a poster")).toBeTruthy();
    expect(screen.getByText("Reading the selected canvas context")).toBeTruthy();
    expect(screen.getByTestId("agent-conversation-stream")).toBeTruthy();
  });

  it("shows a state-specific busy hint while the workflow is running", () => {
    render(
      <CanvasAgentConversationView
        busy
        busyLabel="生成任务已提交"
        items={[{ content: "Continue generating", id: "m1", kind: "message", role: "user" }]}
        onApprove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("生成任务已提交")).toBeTruthy();
  });
});
