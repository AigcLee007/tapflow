import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { CanvasAgentPanel } from "./CanvasAgentPanel";

const mockApproveAgentToolCallStream = vi.fn();
const mockCreateAgentSession = vi.fn();
const mockCreateAgentTurn = vi.fn();
const mockExecuteAgentTurnStream = vi.fn();
const mockGetAgentImageRunSettings = vi.fn();
const mockGetAgentSessionEvents = vi.fn();
const mockGetAgentSessionHistory = vi.fn();
const mockListAgentSessions = vi.fn();
const mockOpenAgentSessionEventStream = vi.fn();
const mockOpenAgentTurnStream = vi.fn();
const mockReadAgentSseStream = vi.fn();

vi.mock("./canvasAgentApi", () => ({
  approveAgentToolCallStream: (...args: unknown[]) => mockApproveAgentToolCallStream(...args),
  createAgentSession: (...args: unknown[]) => mockCreateAgentSession(...args),
  createAgentTurn: (...args: unknown[]) => mockCreateAgentTurn(...args),
  executeAgentTurnStream: (...args: unknown[]) => mockExecuteAgentTurnStream(...args),
  getAgentImageRunSettings: (...args: unknown[]) => mockGetAgentImageRunSettings(...args),
  getAgentSessionEvents: (...args: unknown[]) => mockGetAgentSessionEvents(...args),
  getAgentSessionHistory: (...args: unknown[]) => mockGetAgentSessionHistory(...args),
  listAgentSessions: (...args: unknown[]) => mockListAgentSessions(...args),
  openAgentSessionEventStream: (...args: unknown[]) => mockOpenAgentSessionEventStream(...args),
  openAgentTurnStream: (...args: unknown[]) => mockOpenAgentTurnStream(...args),
  readAgentSseStream: (...args: unknown[]) => mockReadAgentSseStream(...args),
}));

vi.mock("./canvasAgentToolEvents", async () => {
  const actual = await vi.importActual<typeof import("./canvasAgentToolEvents")>("./canvasAgentToolEvents");
  return {
    ...actual,
    readAgentToolEventStream: vi.fn(),
  };
});

const composerPlaceholder = "描述你想完成的创作任务，或者继续刚才的结果...";

function buildSessionSummary() {
  return {
    createdAt: "2026-06-24T00:00:00Z",
    flowId: "flow-1",
    id: "session-1",
    projectId: "project-1",
    title: "Recent Agent Session",
    updatedAt: "2026-06-24T00:01:00Z",
  };
}

function renderPanel() {
  return render(<CanvasAgentPanel open onClose={vi.fn()} onConfirmPlan={vi.fn()} />);
}

describe("CanvasAgentPanel", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    useFlowCanvasStore.getState().newProject();
    mockApproveAgentToolCallStream.mockReset();
    mockCreateAgentSession.mockReset();
    mockCreateAgentTurn.mockReset();
    mockExecuteAgentTurnStream.mockReset();
    mockGetAgentImageRunSettings.mockReset();
    mockGetAgentSessionEvents.mockReset();
    mockGetAgentSessionHistory.mockReset();
    mockListAgentSessions.mockReset();
    mockOpenAgentSessionEventStream.mockReset();
    mockOpenAgentTurnStream.mockReset();
    mockReadAgentSseStream.mockReset();

    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockCreateAgentTurn.mockResolvedValue({
      approvalRequired: true,
      evidence: [],
      plan: [{ reason: "test", step: "Create nodes" }],
      proposedOps: [],
      reply: "Server plan",
      sessionId: "session-1",
      turnId: "turn-1",
    });
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: false, status: 503 });
    mockGetAgentImageRunSettings.mockResolvedValue({
      models: [
        {
          aspectRatios: ["1:1", "16:9"],
          defaultRouteKey: "image.pixellelabs.nano-banana-pro",
          displayName: "Nano Banana Pro",
          modelFamily: "pixellelabs.nano-banana-pro",
          modelKey: "gemini-3-pro-image-preview",
          qualityOptions: [],
          quantityOptions: [1],
          routes: [
            {
              estimatedCredits: 4,
              routeKey: "image.pixellelabs.nano-banana-pro",
              routeLabel: "线路一",
              sizes: [
                { credits: 4, size: "1K" },
                { credits: 4.5, size: "2K" },
                { credits: 5, size: "4K" },
              ],
            },
          ],
          sizes: ["1K", "2K", "4K"],
        },
      ],
    });
    mockGetAgentSessionEvents.mockResolvedValue({ events: [] });
    mockGetAgentSessionHistory.mockResolvedValue({
      messages: [],
      session: null,
      turns: [],
    });
    mockListAgentSessions.mockResolvedValue([]);
    mockOpenAgentSessionEventStream.mockResolvedValue({ ok: true, status: 200 });
    mockOpenAgentTurnStream.mockResolvedValue({ ok: false, status: 503 });
  });

  it("renders the new workspace shell instead of old debug labels", async () => {
    await act(async () => {
      renderPanel();
    });

    expect(screen.getAllByText("TapFlow Agent").length).toBeGreaterThan(0);
    expect(screen.getByText("Canvas Director")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "对话" })).toBeTruthy();
    expect(screen.queryByText("Classic Agent")).toBeNull();
    expect(screen.queryByText("Director Runtime (preview)")).toBeNull();
    expect(screen.queryByText("Replay Events")).toBeNull();
  });

  it("loads conversation history scoped to the current project and flow", async () => {
    useFlowCanvasStore.getState().setBackendFlowBinding({
      backendFlowId: "flow-1",
      backendProjectId: "project-1",
    });

    await act(async () => {
      renderPanel();
    });

    await waitFor(() => {
      expect(mockListAgentSessions).toHaveBeenCalledWith(
        expect.objectContaining({
          flowId: "flow-1",
          projectId: "project-1",
        }),
      );
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

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(composerPlaceholder), {
        target: { value: "Help me create an image flow" },
      });
      fireEvent.click(screen.getByRole("button", { name: "发送" }));
    });

    expect((await screen.findAllByText("Server plan")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "确认执行" })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认执行" }));
    });

    await waitFor(() => expect(onConfirmPlan).toHaveBeenCalledTimes(1));
  });

  it("clears the pending plan when cancel is clicked", async () => {
    renderPanel();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(composerPlaceholder), {
        target: { value: "Help me create an image flow" },
      });
      fireEvent.click(screen.getByRole("button", { name: "发送" }));
    });

    expect(await screen.findByRole("button", { name: "取消" })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "取消" }));
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "确认执行" })).toBeNull();
    });
  });

  it("surfaces a planner error when fallback is disabled", async () => {
    mockCreateAgentTurn.mockRejectedValue(new Error("Agent planner unavailable"));

    renderPanel();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(composerPlaceholder), {
        target: { value: "Help me create an image flow" },
      });
      fireEvent.click(screen.getByRole("button", { name: "发送" }));
    });

    expect(await screen.findByText("Agent 执行失败")).toBeTruthy();
    expect(screen.getAllByText("Agent planner unavailable").length).toBeGreaterThan(0);
  });

  it("restores replayed results and friendly copy for the latest session", async () => {
    mockListAgentSessions.mockResolvedValue([buildSessionSummary()]);
    mockGetAgentSessionHistory.mockResolvedValue({
      messages: [
        {
          content: "Please generate a cover",
          createdAt: "2026-06-24T00:00:00Z",
          id: "m1",
          role: "user",
          sessionId: "session-1",
        },
      ],
      session: buildSessionSummary(),
      turns: [],
    });
    mockGetAgentSessionEvents.mockResolvedValue({
      events: [
        {
          createdAt: "2026-06-24T00:00:01Z",
          eventJson: { toolCallKey: "tool-1", toolName: "generate_image" },
          eventType: "tool_started",
          id: "e1",
          seq: 1,
          sessionId: "session-1",
          taskId: null,
          turnId: null,
        },
        {
          createdAt: "2026-06-24T00:00:02Z",
          eventJson: {
            result: {
              assetRefs: [
                {
                  assetId: "asset-1",
                  kind: "image",
                  label: "Replay image",
                  promptSummary: "",
                  refId: "asset-ref-1",
                },
              ],
              status: "succeeded",
              toolCallId: "task-1",
            },
            toolCallKey: "tool-1",
          },
          eventType: "tool_result",
          id: "e3",
          seq: 3,
          sessionId: "session-1",
          taskId: "task-1",
          turnId: null,
        },
      ],
    });

    renderPanel();

    expect(await screen.findByText("Please generate a cover")).toBeTruthy();
    expect(await screen.findByText("Replay image")).toBeTruthy();
    expect(screen.getByRole("button", { name: "继续编辑" })).toBeTruthy();
  });

  it("restores replayed approval and error states for the latest session", async () => {
    mockListAgentSessions.mockResolvedValue([buildSessionSummary()]);
    mockGetAgentSessionHistory.mockResolvedValue({
      messages: [],
      session: buildSessionSummary(),
      turns: [],
    });
    mockGetAgentSessionEvents.mockResolvedValue({
      events: [
        {
          createdAt: "2026-06-24T00:00:01Z",
          eventJson: { toolCallKey: "tool-edit-1", toolName: "edit_image" },
          eventType: "tool_started",
          id: "r1",
          seq: 1,
          sessionId: "session-1",
          taskId: null,
          turnId: null,
        },
        {
          createdAt: "2026-06-24T00:00:02Z",
          eventJson: {
            estimate: { referenceRefs: ["round-1-image-1"], totalCredits: 4 },
            toolCallKey: "tool-edit-1",
            turnId: "turn-1",
          },
          eventType: "approval_required",
          id: "r2",
          seq: 2,
          sessionId: "session-1",
          taskId: null,
          turnId: "turn-1",
        },
        {
          createdAt: "2026-06-24T00:00:03Z",
          eventJson: {
            code: "AGENT_EXECUTOR_FAILED",
            message: "Provider timeout",
            turnId: "turn-1",
          },
          eventType: "turn_failed",
          id: "r3",
          seq: 3,
          sessionId: "session-1",
          taskId: null,
          turnId: "turn-1",
        },
      ],
    });

    renderPanel();

    expect(await screen.findByText("Agent 执行失败")).toBeTruthy();
    expect(screen.getAllByText("Provider timeout").length).toBeGreaterThan(0);
  });

  it("fills the composer with a continuation prompt from a replayed result", async () => {
    mockListAgentSessions.mockResolvedValue([buildSessionSummary()]);
    mockGetAgentSessionHistory.mockResolvedValue({
      messages: [],
      session: buildSessionSummary(),
      turns: [],
    });
    mockGetAgentSessionEvents.mockResolvedValue({
      events: [
        {
          createdAt: "2026-06-24T00:00:01Z",
          eventJson: { toolCallKey: "tool-1", toolName: "generate_image" },
          eventType: "tool_started",
          id: "e1",
          seq: 1,
          sessionId: "session-1",
          taskId: null,
          turnId: null,
        },
        {
          createdAt: "2026-06-24T00:00:02Z",
          eventJson: {
            result: {
              assetRefs: [
                {
                  assetId: "asset-1",
                  kind: "image",
                  label: "Replay image",
                  promptSummary: "forest sports day",
                  refId: "round-1-image-1",
                },
              ],
              status: "succeeded",
              toolCallId: "task-1",
            },
            toolCallKey: "tool-1",
          },
          eventType: "tool_result",
          id: "e2",
          seq: 2,
          sessionId: "session-1",
          taskId: "task-1",
          turnId: null,
        },
      ],
    });

    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "继续编辑" }));
    await waitFor(() => {
      expect((screen.getByPlaceholderText(composerPlaceholder) as HTMLTextAreaElement).value).toBe(
        "基于这些结果继续编辑：Replay image。保留主体和核心构图，按当前目标继续深化。",
      );
    });
  });

  it("shows a next-step suggestion banner after choosing a continuation result", async () => {
    mockListAgentSessions.mockResolvedValue([buildSessionSummary()]);
    mockGetAgentSessionHistory.mockResolvedValue({
      messages: [],
      session: buildSessionSummary(),
      turns: [],
    });
    mockGetAgentSessionEvents.mockResolvedValue({
      events: [
        {
          createdAt: "2026-06-24T00:00:01Z",
          eventJson: { toolCallKey: "tool-1", toolName: "generate_image" },
          eventType: "tool_started",
          id: "e1",
          seq: 1,
          sessionId: "session-1",
          taskId: null,
          turnId: null,
        },
        {
          createdAt: "2026-06-24T00:00:02Z",
          eventJson: {
            result: {
              assetRefs: [
                {
                  assetId: "asset-1",
                  kind: "image",
                  label: "Replay image",
                  promptSummary: "forest sports day",
                  refId: "round-1-image-1",
                },
              ],
              status: "succeeded",
              toolCallId: "task-1",
            },
            toolCallKey: "tool-1",
          },
          eventType: "tool_result",
          id: "e2",
          seq: 2,
          sessionId: "session-1",
          taskId: "task-1",
          turnId: null,
        },
      ],
    });

    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "继续编辑" }));
    expect(await screen.findByText("建议下一步")).toBeTruthy();
  });
});
