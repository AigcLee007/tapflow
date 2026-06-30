import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentPlanCard } from "./CanvasAgentPlanCard";

describe("CanvasAgentPlanCard", () => {
  it("shows separate create and run actions when run_node is present", () => {
    const onCreateAndRun = vi.fn();
    const onCreateOnly = vi.fn();

    render(
      <CanvasAgentPlanCard
        onCancel={vi.fn()}
        onConfirm={onCreateAndRun}
        onCreateOnly={onCreateOnly}
        plan={{
          approvalRequired: true,
          costEstimate: { totalCredits: 8, items: [{ credits: 8, label: "图片生成", quantity: 1 }] },
          evidence: [],
          plan: [{ reason: "生成图片", step: "创建并运行图片节点" }],
          proposedOps: [
            { data: { title: "封面图" }, kind: "image", position: { x: 10, y: 20 }, type: "add_node" },
            { type: "run_node", nodeId: "image-1", runMode: "target_node" },
          ],
          reply: "准备生成",
        }}
      />,
    );

    expect((screen.getByRole("button", { name: "创建流程" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "创建并执行" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "创建流程" }));
    fireEvent.click(screen.getByRole("button", { name: "创建并执行" }));

    expect(onCreateOnly).toHaveBeenCalledTimes(1);
    expect(onCreateAndRun).toHaveBeenCalledTimes(1);
  });
});
