import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFlowCanvasStore } from "../../store/flowCanvasStore";
import { CanvasAgentPanel } from "../CanvasAgentPanel";

const mockGetAgentImageRunSettings = vi.fn();
const mockListAgentV5Sessions = vi.fn();
const mockSession = {
  blocks: [{ type: "paragraph" as const, text: "V6 对话内容" }],
  error: null,
  mode: "manual_confirmation" as const,
  newConversation: vi.fn(),
  openSession: vi.fn(),
  phase: "idle" as const,
  sessionId: "session-1",
  sessionTitle: "V6 对话",
  setExecutionMode: vi.fn(),
  submitDecision: vi.fn(),
  submitText: vi.fn(),
};

vi.mock("../canvasAgentApi", () => ({
  approveAgentSkillRun: vi.fn(),
  cancelAgentSkillRun: vi.fn(),
  getAgentCapabilities: vi.fn(),
  getAgentImageRunSettings: (...args: unknown[]) => mockGetAgentImageRunSettings(...args),
  getAgentSkillRun: vi.fn(),
  listAgentSessions: vi.fn(),
  listAgentSkills: vi.fn(),
}));

vi.mock("../v5/agentV5Api", () => ({
  listAgentV5Sessions: (...args: unknown[]) => mockListAgentV5Sessions(...args),
}));

vi.mock("../v5/useAgentV5Session", () => ({
  useAgentV5Session: () => mockSession,
}));

function renderPanel(overrides: Partial<React.ComponentProps<typeof CanvasAgentPanel>> = {}) {
  return render(
    <CanvasAgentPanel
      onClose={vi.fn()}
      onConfirmPlan={vi.fn(async () => ({ createdNodeIds: [], errors: [], ok: true, ranNodeIds: [] }))}
      open
      {...overrides}
    />,
  );
}

describe("CanvasAgentPanel V6 integration", () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().newProject();
    mockGetAgentImageRunSettings.mockReset().mockResolvedValue({ models: [] });
    mockListAgentV5Sessions.mockReset().mockResolvedValue([]);
    mockSession.newConversation.mockReset();
    mockSession.openSession.mockReset().mockResolvedValue(undefined);
    mockSession.setExecutionMode.mockReset();
    mockSession.submitDecision.mockReset().mockResolvedValue(undefined);
    mockSession.submitText.mockReset().mockResolvedValue(undefined);
  });

  it("renders the completed V6 workspace as the default agent tree", async () => {
    renderPanel();

    expect(screen.getByTestId("agent-v6-workspace")).toBeTruthy();
    expect(screen.getByTestId("agent-v6-composer")).toBeTruthy();
    expect(screen.queryByTestId("agent-v5-window")).toBeNull();
    expect(screen.queryByTestId("agent-panel-conversation")).toBeNull();
    expect(screen.queryByTestId("agent-composer-dock")).toBeNull();
    expect(screen.queryByTestId("agent-shell-toolbar")).toBeNull();
    expect(screen.queryByText("Timeline")).toBeNull();
    expect(screen.queryByText("PlanCard")).toBeNull();
    expect(screen.queryByText("SkillBar")).toBeNull();
    await waitFor(() => expect(mockListAgentV5Sessions).toHaveBeenCalledWith({ flowId: null, projectId: null }));
  });

  it("preserves panel close, scope loading, and the existing session callback adapter", async () => {
    const onClose = vi.fn();
    renderPanel({ onClose });

    await waitFor(() => expect(mockListAgentV5Sessions).toHaveBeenCalledWith({ flowId: null, projectId: null }));
    expect(screen.getByText("V6 对话内容")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "收起 Agent" }));
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByRole("textbox", { name: "Agent 输入" }), { target: { value: "继续" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(mockSession.submitText).toHaveBeenCalledWith("继续", expect.objectContaining({ referenceContext: { items: [] } }));
  });

  it("keeps the panel closed when open is false", () => {
    renderPanel({ open: false });
    expect(screen.queryByTestId("agent-v6-workspace")).toBeNull();
  });
});
