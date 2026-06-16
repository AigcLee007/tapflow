import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentPlanCard } from "./CanvasAgentPlanCard";

describe("CanvasAgentPlanCard", () => {
  it("shows credit confirmation when run_node is present", () => {
    const onConfirm = vi.fn();

    render(
      <CanvasAgentPlanCard
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        onCreateOnly={vi.fn()}
        plan={{
          approvalRequired: true,
          costEstimate: { totalCredits: 8, items: [{ credits: 8, label: "图片生成", quantity: 1 }] },
          evidence: [],
          plan: [{ reason: "生成图片", step: "运行图片节点" }],
          proposedOps: [{ type: "run_node", nodeId: "image-1", runMode: "target_node" }],
          reply: "准备生成",
        }}
      />,
    );

    expect(screen.getByText("预计消耗 8 积分")).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认并生成" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "确认并生成" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
