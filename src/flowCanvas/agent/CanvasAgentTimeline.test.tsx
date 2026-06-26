import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentTimeline } from "./CanvasAgentTimeline";

describe("CanvasAgentTimeline", () => {
  it("renders result and error items together", () => {
    render(
      <CanvasAgentTimeline
        items={[
          {
            assets: [{ assetId: "asset-1", kind: "image", label: "结果 1", promptSummary: "", refId: "ref-1" }],
            id: "r1",
            kind: "result",
            toolCallKey: "tool-1",
          },
          {
            id: "e1",
            kind: "error",
            message: "积分不足",
            retryable: true,
            title: "Agent 执行失败",
          },
        ]}
        onApprove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("生成结果")).toBeTruthy();
    expect(screen.getByText("Agent 执行失败")).toBeTruthy();
    expect(screen.getByText("积分不足")).toBeTruthy();
  });
});
