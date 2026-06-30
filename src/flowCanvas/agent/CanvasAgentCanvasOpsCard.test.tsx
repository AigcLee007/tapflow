import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentCanvasOpsCard } from "./CanvasAgentCanvasOpsCard";

describe("CanvasAgentCanvasOpsCard", () => {
  it("shows create and run as separate actions when run ops are present", () => {
    const onCreateOnly = vi.fn();
    const onCreateAndRun = vi.fn();

    render(
      <CanvasAgentCanvasOpsCard
        onCancel={vi.fn()}
        onCreateAndRun={onCreateAndRun}
        onCreateOnly={onCreateOnly}
        ops={[
          {
            data: { title: "海报文案" },
            kind: "text",
            position: { x: 80, y: 120 },
            type: "add_node",
          },
          {
            nodeId: "image-1",
            runMode: "target_node",
            type: "run_node",
          },
        ]}
      />,
    );

    expect(screen.getByText("待确认画布操作")).toBeTruthy();
    expect(screen.getByText("执行会进入积分预估或扣费确认流程")).toBeTruthy();
    expect((screen.getByRole("button", { name: "创建流程" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "创建并执行" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "创建流程" }));
    fireEvent.click(screen.getByRole("button", { name: "创建并执行" }));

    expect(onCreateOnly).toHaveBeenCalledTimes(1);
    expect(onCreateAndRun).toHaveBeenCalledTimes(1);
  });

  it("disables create-only when the ops only contain run steps", () => {
    render(
      <CanvasAgentCanvasOpsCard
        onCancel={vi.fn()}
        onCreateAndRun={vi.fn()}
        onCreateOnly={vi.fn()}
        ops={[
          {
            nodeId: "image-1",
            runMode: "target_node",
            type: "run_node",
          },
        ]}
      />,
    );

    expect((screen.getByRole("button", { name: "创建流程" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "创建并执行" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
