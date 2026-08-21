import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasAgentSkillPlan } from "./CanvasAgentSkillPlan";
import type { AgentSkillPlan } from "./canvasAgentSkillTypes";

const plan: AgentSkillPlan = {
  id: "plan-1",
  status: "waiting_for_approval",
  estimatedCredits: 4,
  steps: [
    { action: "text", id: "step-1", index: 0, label: "生成文案", status: "waiting_for_approval" },
    { action: "image", id: "step-2", index: 1, label: "制作封面", status: "failed", error: "生成超时" },
  ],
};

describe("CanvasAgentSkillPlan", () => {
  it("shows approval controls and delegates approval/cancel", () => {
    const onApprove = vi.fn();
    const onCancel = vi.fn();
    render(<CanvasAgentSkillPlan onApprove={onApprove} onCancel={onCancel} plan={plan} />);

    fireEvent.click(screen.getByRole("button", { name: "批准执行" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByText("预计 4 积分")).toBeTruthy();
  });

  it("exposes retry for failed steps", () => {
    const onRetry = vi.fn();
    render(<CanvasAgentSkillPlan onRetry={onRetry} plan={{ ...plan, status: "failed" }} />);
    fireEvent.click(screen.getByRole("button", { name: "重试 制作封面" }));
    expect(onRetry).toHaveBeenCalledWith(plan.steps[1]);
  });
});
