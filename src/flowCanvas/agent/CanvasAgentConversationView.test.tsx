import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentConversationView } from "./CanvasAgentConversationView";

describe("CanvasAgentConversationView", () => {
  it("renders the empty production state", () => {
    render(
      <CanvasAgentConversationView
        busy={false}
        items={[]}
        onApprove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("TapFlow Agent")).toBeTruthy();
    expect(screen.getByText("One canvas, every production step")).toBeTruthy();
  });

  it("renders timeline messages and statuses", () => {
    render(
      <CanvasAgentConversationView
        busy={false}
        items={[
          { content: "帮我生成海报", id: "m1", kind: "message", role: "user" },
          { id: "s1", kind: "status", state: "active", title: "正在理解需求" },
        ]}
        onApprove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("帮我生成海报")).toBeTruthy();
    expect(screen.getByText("正在理解需求")).toBeTruthy();
  });
});
