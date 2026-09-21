import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { CanvasAgentPanel } from "./CanvasAgentPanel";

const mockGetAgentImageRunSettings = vi.fn();
const mockListAgentSkills = vi.fn();
const mockListSessions = vi.fn();
const mockSession = {
  blocks: [{ text: "请先选择产品方向。", type: "paragraph" as const }],
  error: null,
  mode: "manual_confirmation" as const,
  newConversation: vi.fn(),
  openSession: vi.fn(),
  phase: "waiting_for_choice" as const,
  sessionId: "session-v5-1",
  sessionTitle: "儿童陪伴玩具探索",
  setExecutionMode: vi.fn(),
  submitDecision: vi.fn(),
  submitText: vi.fn(),
};

vi.mock("./canvasAgentApi", () => ({
  getAgentImageRunSettings: (...args: unknown[]) => mockGetAgentImageRunSettings(...args),
  listAgentSkills: (...args: unknown[]) => mockListAgentSkills(...args),
}));

vi.mock("./v6/orchestration/agentV6Api", () => ({
  agentV6Api: { listSessions: (...args: unknown[]) => mockListSessions(...args) },
}));

vi.mock("./runtime/useAgentRuntime", () => ({
  useAgentRuntime: () => mockSession,
}));

function renderPanel() {
  return render(
    <CanvasAgentPanel
      onClose={vi.fn()}
      onConfirmPlan={vi.fn(async () => ({ createdNodeIds: [], errors: [], ok: true, ranNodeIds: [] }))}
      open
    />,
  );
}

describe("CanvasAgentPanel V6 integration", () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().newProject();
    mockGetAgentImageRunSettings.mockReset().mockResolvedValue({ models: [] });
    mockListAgentSkills.mockReset().mockResolvedValue([]);
    mockListSessions.mockReset().mockResolvedValue([{
      createdAt: "2026-09-06T00:00:00Z",
      flowId: null,
      id: "session-history-1",
      projectId: null,
      title: "上一次玩具探索",
      updatedAt: "2026-09-06T00:01:00Z",
    }]);
    mockSession.newConversation.mockReset();
    mockSession.openSession.mockReset().mockResolvedValue(undefined);
    mockSession.setExecutionMode.mockReset();
    mockSession.submitDecision.mockReset().mockResolvedValue(undefined);
    mockSession.submitText.mockReset().mockResolvedValue(undefined);
  });

  it("renders the V6 workspace backed by the durable session adapter", async () => {
    await act(async () => {
      renderPanel();
    });

    expect(screen.getByTestId("agent-v6-workspace")).toBeTruthy();
    expect(screen.getByTestId("agent-v6-composer")).toBeTruthy();
    expect(screen.getByText("请先选择产品方向。")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Agent 输入" })).toBeTruthy();
    expect(screen.queryByTestId("agent-panel-conversation")).toBeNull();
    expect(screen.queryByTestId("agent-composer-dock")).toBeNull();
    expect(screen.queryByTestId("agent-shell-toolbar")).toBeNull();
  });

  it("submits composer input with the V6 reference context adapter", async () => {
    renderPanel();

    fireEvent.change(screen.getByRole("textbox", { name: "Agent 输入" }), {
      target: { value: "根据小黄人形象设计一款儿童陪伴玩具" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(mockSession.submitText).toHaveBeenCalledWith(
        "根据小黄人形象设计一款儿童陪伴玩具",
        expect.objectContaining({
          modelKey: null,
          referenceContext: { items: [] },
        }),
      );
    });
  });

  it("opens durable history and resets the session from the V6 header", async () => {
    renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "历史" }));
    });
    expect(await screen.findByText("上一次玩具探索")).toBeTruthy();
    fireEvent.click(screen.getByText("上一次玩具探索"));

    await waitFor(() => {
      expect(mockSession.openSession).toHaveBeenCalledWith("session-history-1");
    });

    fireEvent.click(screen.getByRole("button", { name: "新建对话" }));
    expect(mockSession.newConversation).toHaveBeenCalledTimes(1);
  });
});
