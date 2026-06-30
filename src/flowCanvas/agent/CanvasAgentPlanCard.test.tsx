import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentPlanCard } from "./CanvasAgentPlanCard";

describe("CanvasAgentPlanCard", () => {
  it("shows a compact action preview with separate create and run actions", () => {
    const onCreateAndRun = vi.fn();
    const onCreateOnly = vi.fn();

    render(
      <CanvasAgentPlanCard
        onCancel={vi.fn()}
        onConfirm={onCreateAndRun}
        onCreateOnly={onCreateOnly}
        plan={{
          approvalRequired: true,
          costEstimate: { totalCredits: 8, items: [{ credits: 8, label: "Image generation", quantity: 1 }] },
          evidence: [],
          plan: [{ reason: "Generate image", step: "Create and run the image node" }],
          proposedOps: [
            { data: { title: "Cover image" }, kind: "image", position: { x: 10, y: 20 }, type: "add_node" },
            { type: "run_node", nodeId: "image-1", runMode: "target_node" },
          ],
          reply: "Ready to generate",
        }}
      />,
    );

    expect(screen.getByText("Agent will make these canvas changes")).toBeTruthy();
    expect((screen.getByRole("button", { name: "创建流程" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "创建并执行" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "创建流程" }));
    fireEvent.click(screen.getByRole("button", { name: "创建并执行" }));

    expect(onCreateOnly).toHaveBeenCalledTimes(1);
    expect(onCreateAndRun).toHaveBeenCalledTimes(1);
  });
});
