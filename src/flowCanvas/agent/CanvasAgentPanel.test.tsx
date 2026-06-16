import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { CanvasAgentPanel } from "./CanvasAgentPanel";

const mockCreateAgentSession = vi.fn();
const mockCreateAgentTurn = vi.fn();
const mockOpenAgentTurnStream = vi.fn();
const mockReadAgentSseStream = vi.fn();

vi.mock("./canvasAgentApi", () => ({
  createAgentSession: (...args: unknown[]) => mockCreateAgentSession(...args),
  createAgentTurn: (...args: unknown[]) => mockCreateAgentTurn(...args),
  openAgentTurnStream: (...args: unknown[]) => mockOpenAgentTurnStream(...args),
  readAgentSseStream: (...args: unknown[]) => mockReadAgentSseStream(...args),
}));

describe("CanvasAgentPanel", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    useFlowCanvasStore.getState().newProject();
    mockCreateAgentSession.mockReset();
    mockCreateAgentTurn.mockReset();
    mockOpenAgentTurnStream.mockReset();
    mockReadAgentSseStream.mockReset();
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockOpenAgentTurnStream.mockResolvedValue({ ok: false, status: 503 });
    mockCreateAgentTurn.mockResolvedValue({
      approvalRequired: true,
      evidence: [],
      plan: [{ reason: "test", step: "创建节点" }],
      proposedOps: [],
      reply: "服务端计划",
      sessionId: "session-1",
      turnId: "turn-1",
    });
  });

  it("shows a server plan and calls confirm handler", async () => {
    const onConfirmPlan = vi.fn(async () => ({
      createdNodeIds: [],
      errors: [],
      ok: true,
      ranNodeIds: [],
    }));

    render(<CanvasAgentPanel open onClose={vi.fn()} onConfirmPlan={onConfirmPlan} />);

    fireEvent.change(screen.getByPlaceholderText("描述你想完成的生产任务，或引用当前画布内容..."), {
      target: { value: "帮我做一张森林运动会图片" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByRole("button", { name: "确认执行" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "确认执行" }));

    await waitFor(() => expect(onConfirmPlan).toHaveBeenCalledTimes(1));
  });

  it("clears the pending plan when cancel is clicked", async () => {
    render(<CanvasAgentPanel open onClose={vi.fn()} onConfirmPlan={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("描述你想完成的生产任务，或引用当前画布内容..."), {
      target: { value: "帮我做一张森林运动会图片" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByRole("button", { name: "取消" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "确认执行" })).toBeNull();
    });
  });

  it("surfaces a planner error when fallback is disabled", async () => {
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockOpenAgentTurnStream.mockResolvedValue({ ok: false, status: 503 });
    mockCreateAgentTurn.mockRejectedValue(new Error("Agent planner unavailable"));

    render(<CanvasAgentPanel open onClose={vi.fn()} onConfirmPlan={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("描述你想完成的生产任务，或引用当前画布内容..."), {
      target: { value: "帮我做一张森林运动会图片" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("最近一次执行失败")).toBeTruthy();
    expect(screen.getAllByText("Agent planner unavailable").length).toBeGreaterThan(0);
  });
});
