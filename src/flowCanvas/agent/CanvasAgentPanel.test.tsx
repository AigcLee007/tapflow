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
const mockUploadAssetFile = vi.fn();

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

vi.mock("../../assets/assetApi", () => ({
  uploadAssetFile: (...args: unknown[]) => mockUploadAssetFile(...args),
}));

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
    mockUploadAssetFile.mockReset();

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
    mockUploadAssetFile.mockResolvedValue({
      id: "asset-upload-1",
      previewUrl: "https://signed.example/ref",
      title: "ref.png",
    });
  });

  it("renders the new workspace shell instead of old debug labels", async () => {
    await act(async () => {
      renderPanel();
    });

    expect(screen.getAllByText("TapFlow Agent").length).toBeGreaterThan(0);
    expect(screen.getByText("Canvas Copilot")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "对话" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "连接配置" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "日志" })).toBeNull();
    const toolbar = screen.getByTestId("agent-shell-toolbar");
    expect(Array.from(toolbar.querySelectorAll("button")).map((button) => button.getAttribute("aria-label"))).toEqual([
      "日志",
      "对话",
      "历史",
      "新对话",
      "收起 Agent",
    ]);
    expect(screen.getByTestId("agent-panel-conversation")).toBeTruthy();
    expect(screen.getByTestId("agent-composer-dock")).toBeTruthy();
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

  it("merges uploaded references into the sent referenceContext and clears them after send", async () => {
    useFlowCanvasStore.getState().setBackendFlowBinding({
      backendFlowId: "flow-1",
      backendProjectId: "project-1",
    });
    mockCreateAgentTurn.mockResolvedValue({
      approvalRequired: false,
      evidence: [],
      plan: [],
      proposedOps: [],
      reply: "ok",
      sessionId: "session-1",
      turnId: "turn-1",
    });

    const { container } = renderPanel();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();

    await act(async () => {
      fireEvent.change(input!, {
        target: {
          files: [new File(["image"], "ref.png", { type: "image/png" })],
        },
      });
    });

    expect(await screen.findByText("参考图 1")).toBeTruthy();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Agent prompt"), { target: { value: "Use ref" } });
      fireEvent.click(screen.getByRole("button", { name: "发送" }));
    });

    await waitFor(() => {
      expect(mockCreateAgentTurn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          referenceContext: {
            items: [expect.objectContaining({ assetId: "asset-upload-1", refId: "upload-1" })],
          },
        }),
      );
    });
    expect(JSON.stringify(mockCreateAgentTurn.mock.calls.at(-1)?.[1])).not.toMatch(/previewUrl|signed\.example/i);
    expect(mockUploadAssetFile).toHaveBeenCalledWith({
      file: expect.objectContaining({ name: "ref.png" }),
      kind: "image",
      projectId: "project-1",
    });
    expect(screen.queryByText("参考图 1")).toBeNull();
  });

  it("updates selected canvas references when selection changes without changing count", async () => {
    useFlowCanvasStore.getState().setBackendFlowBinding({
      backendFlowId: "flow-1",
      backendProjectId: "project-1",
    });
    const first = useFlowCanvasStore
      .getState()
      .addNode("image", { x: 0, y: 0 }, { assetId: "asset-selected-a", title: "Selected A" });
    const second = useFlowCanvasStore
      .getState()
      .addNode("image", { x: 120, y: 0 }, { assetId: "asset-selected-b", title: "Selected B" });
    useFlowCanvasStore.getState().selectNodesByIds([first.id]);

    renderPanel();

    await act(async () => {
      useFlowCanvasStore.getState().selectNodesByIds([second.id]);
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Agent prompt"), { target: { value: "Use selected image" } });
      fireEvent.click(screen.getByRole("button", { name: "发送" }));
    });

    await waitFor(() => {
      expect(mockCreateAgentTurn).toHaveBeenCalled();
    });
    const referenceItems = mockCreateAgentTurn.mock.calls.at(-1)?.[1]?.referenceContext?.items ?? [];
    expect(referenceItems).toEqual([
      expect.objectContaining({
        assetId: "asset-selected-b",
      }),
    ]);
    expect(referenceItems).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetId: "asset-selected-a",
        }),
      ]),
    );
  });

  it("shows a server plan and calls confirm handler", async () => {
    const onConfirmPlan = vi.fn(async () => ({
      createdNodeIds: [],
      errors: [],
      ok: true,
      ranNodeIds: [],
    }));
    const onCreateOnlyPlan = vi.fn(async () => ({
      createdNodeIds: [],
      errors: [],
      ok: true,
      ranNodeIds: [],
    }));

    mockCreateAgentTurn.mockResolvedValue({
      approvalRequired: true,
      evidence: [],
      plan: [{ reason: "test", step: "Create nodes" }],
      proposedOps: [
        { data: { title: "Cover image" }, kind: "image", position: { x: 10, y: 20 }, type: "add_node" },
        { type: "run_node", nodeId: "image-1", runMode: "target_node" },
      ],
      reply: "Server plan",
      sessionId: "session-1",
      turnId: "turn-1",
    });

    render(<CanvasAgentPanel open onClose={vi.fn()} onConfirmPlan={onConfirmPlan} onCreateOnlyPlan={onCreateOnlyPlan} />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Agent prompt"), {
        target: { value: "Help me create an image flow" },
      });
      fireEvent.click(screen.getByRole("button", { name: "发送" }));
    });

    expect((await screen.findAllByText("Server plan")).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "创建流程" }).length).toBeGreaterThan(0);

    await act(async () => {
      const createAndRunButtons = screen.getAllByRole("button", { name: "创建并执行" });
      fireEvent.click(createAndRunButtons[createAndRunButtons.length - 1]!);
    });

    await waitFor(() => expect(onConfirmPlan).toHaveBeenCalledTimes(1));
  });

  it("clears the pending plan when cancel is clicked", async () => {
    renderPanel();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Agent prompt"), {
        target: { value: "Help me create an image flow" },
      });
      fireEvent.click(screen.getByRole("button", { name: "发送" }));
    });

    expect(await screen.findByRole("button", { name: "取消" })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "取消" }));
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "创建流程" })).toBeNull();
    });
  });

  it("surfaces a planner error when fallback is disabled", async () => {
    mockCreateAgentTurn.mockRejectedValue(new Error("Agent planner unavailable"));

    renderPanel();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Agent prompt"), {
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

    await screen.findByText("Replay image");
    fireEvent.click(await screen.findByRole("button", { name: "继续编辑" }));
    await waitFor(() => {
      expect((screen.getByLabelText("Agent prompt") as HTMLTextAreaElement).value).toBe(
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

    await screen.findByText("Replay image");
    fireEvent.click(await screen.findByRole("button", { name: "继续编辑" }));
    expect(await screen.findByText("建议下一步")).toBeTruthy();
  });
});
