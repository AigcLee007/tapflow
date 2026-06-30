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
    expect(screen.getByText("Pick nodes or describe the next canvas step.")).toBeTruthy();
    expect(screen.queryByText("One canvas, every production step")).toBeNull();
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
        busyLabel="Generation submitted"
        items={[{ content: "Continue generating", id: "m1", kind: "message", role: "user" }]}
        onApprove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Generation submitted")).toBeTruthy();
  });
});
