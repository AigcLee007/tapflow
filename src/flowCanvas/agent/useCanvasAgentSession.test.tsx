import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { V2HttpError } from "../../services/v2HttpClient";
import { registerRemoteDraftSaveBarrier, resetRemoteDraftSaveBarrierStateForTests } from "../runtime/remoteDraftSaveBarrier";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { useCanvasAgentSession } from "./useCanvasAgentSession";

const mockCreateAgentSession = vi.fn();
const mockCreateAgentTurn = vi.fn();
const mockApproveAgentToolCallStream = vi.fn();
const mockExecuteAgentTurnStream = vi.fn();
const mockGetAgentImageRunSettings = vi.fn();
const mockOpenAgentTurnStream = vi.fn();
const mockReadAgentSseStream = vi.fn();
const mockReadAgentToolEventStream = vi.fn();

vi.mock("./canvasAgentApi", () => ({
  approveAgentToolCallStream: (...args: unknown[]) => mockApproveAgentToolCallStream(...args),
  createAgentSession: (...args: unknown[]) => mockCreateAgentSession(...args),
  createAgentTurn: (...args: unknown[]) => mockCreateAgentTurn(...args),
  executeAgentTurnStream: (...args: unknown[]) => mockExecuteAgentTurnStream(...args),
  getAgentImageRunSettings: (...args: unknown[]) => mockGetAgentImageRunSettings(...args),
  openAgentTurnStream: (...args: unknown[]) => mockOpenAgentTurnStream(...args),
  readAgentSseStream: (...args: unknown[]) => mockReadAgentSseStream(...args),
}));

vi.mock("./canvasAgentToolEvents", () => ({
  readAgentToolEventStream: (...args: unknown[]) => mockReadAgentToolEventStream(...args),
}));

describe("useCanvasAgentSession", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetRemoteDraftSaveBarrierStateForTests();
    useFlowCanvasStore.getState().newProject();
    mockCreateAgentSession.mockReset();
    mockCreateAgentTurn.mockReset();
    mockApproveAgentToolCallStream.mockReset();
    mockExecuteAgentTurnStream.mockReset();
    mockGetAgentImageRunSettings.mockReset();
    mockOpenAgentTurnStream.mockReset();
    mockReadAgentSseStream.mockReset();
    mockReadAgentToolEventStream.mockReset();
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: false, status: 503 });
    mockApproveAgentToolCallStream.mockResolvedValue({ ok: true, status: 200 });
    mockGetAgentImageRunSettings.mockResolvedValue({
      models: [
        {
          aspectRatios: ["1:1", "16:9", "9:16"],
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
        {
          aspectRatios: ["1:1", "4:3", "3:4"],
          defaultRouteKey: "image.gpt-image-2.line2",
          displayName: "GPT-Image-2",
          modelFamily: "gpt-image-2",
          modelKey: "gpt-image-2",
          qualityOptions: [],
          quantityOptions: [1],
          routes: [
            {
              estimatedCredits: 3,
              routeKey: "image.gpt-image-2.line2",
              routeLabel: "线路二",
              sizes: [
                { credits: 3, size: "1K" },
                { credits: 3.5, size: "2K" },
                { credits: 4, size: "4K" },
              ],
            },
          ],
          sizes: ["1K", "2K", "4K"],
        },
      ],
    });
  });

  it("uses server planning when agent API succeeds", async () => {
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

    const { result } = renderHook(() => useCanvasAgentSession());
    await act(async () => {
      await result.current.sendPrompt("帮我整理当前画布结构");
    });

    expect(result.current.messages.at(-1)?.content).toBe("服务端计划");
    expect(result.current.status).toBe("awaiting_approval");
  });

  it("tracks executor tool timeline from streaming events", async () => {
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: true, status: 200 });
    mockReadAgentToolEventStream.mockImplementation(async (_response, onEvent) => {
      onEvent({ content: "Starting.", type: "message_delta" });
      onEvent({ toolCallKey: "tool-1", toolName: "generate_image", type: "tool_started" });
      onEvent({ taskId: "tool-db-1", title: "图片生成", toolCallKey: "tool-1", toolName: "generate_image", type: "task_created" });
      onEvent({
        assetRef: { assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" },
        taskId: "tool-db-1",
        toolCallKey: "tool-1",
        type: "artifact_created",
      });
      onEvent({
        result: {
          assetRefs: [{ assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" }],
          status: "succeeded",
        },
        toolCallKey: "tool-1",
        type: "tool_result",
      });
      onEvent({ finalText: "Done.", turnId: "turn-1", type: "turn_completed" });
    });

    const { result } = renderHook(() => useCanvasAgentSession());
    await act(async () => {
      await result.current.sendPrompt("Generate an image");
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.activityTimeline.some((item) => item.label === "正在提交生成任务")).toBe(true);
    expect(result.current.activityTimeline.some((item) => item.label === "正在保存到素材库")).toBe(true);
    expect(result.current.toolTimeline).toEqual([
      expect.objectContaining({
        assetRefs: [expect.objectContaining({ assetId: "asset-1" })],
        status: "succeeded",
        taskId: "tool-db-1",
        toolCallKey: "tool-1",
      }),
    ]);
    expect(result.current.messages.some((message) => message.content.includes("Done."))).toBe(true);
  });

  it("records visible activity states before and during execution", async () => {
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: true, status: 200 });
    mockReadAgentToolEventStream.mockImplementation(async (_response, onEvent) => {
      onEvent({ detail: "Analyzing canvas context", label: "Understanding request", type: "thinking_status" });
      onEvent({ toolCallKey: "tool-1", toolName: "generate_image", type: "tool_started" });
      onEvent({ nodeRunId: "node-1", toolCallKey: "tool-1", type: "workflow_run_linked", workflowRunId: "run-1" });
      onEvent({
        result: {
          assetRefs: [],
          status: "failed",
        },
        toolCallKey: "tool-1",
        type: "tool_result",
      });
      onEvent({ finalText: "Done.", turnId: "turn-1", type: "turn_completed" });
    });

    const { result } = renderHook(() => useCanvasAgentSession());
    await act(async () => {
      await result.current.sendPrompt("Generate an image");
    });

    expect(result.current.activityTimeline.map((item) => item.label)).toEqual(
      expect.arrayContaining(["Understanding request", "正在提交生成任务", "正在等待模型返回结果", "生成失败", "已完成"]),
    );
  });

  it("labels edit_image approval tasks as image edit cards", async () => {
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: true, status: 200 });
    mockReadAgentToolEventStream.mockImplementation(async (_response, onEvent) => {
      onEvent({ toolCallKey: "tool-edit-1", toolName: "edit_image", type: "tool_started" });
      onEvent({
        estimate: { referenceRefs: ["round-1-image-1", "asset:2"], totalCredits: 4 },
        toolCallKey: "tool-edit-1",
        turnId: "turn-1",
        type: "approval_required",
      });
      onEvent({ finalText: "Confirm edit settings.", turnId: "turn-1", type: "turn_completed" });
    });

    const { result } = renderHook(() => useCanvasAgentSession());
    await act(async () => {
      await result.current.sendPrompt("Edit this selected image");
    });

    expect(result.current.toolTimeline[0]).toMatchObject({
      estimate: expect.objectContaining({
        referenceRefs: ["round-1-image-1", "asset:2"],
      }),
      status: "awaiting_approval",
      title: "图片编辑",
      toolCallKey: "tool-edit-1",
      toolName: "edit_image",
    });
  });

  it("creates a runnable image node before sending an empty-canvas production prompt", async () => {
    useFlowCanvasStore.getState().setBackendFlowBinding({
      backendFlowId: "flow-1",
      backendProjectId: "project-1",
    });
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: true, status: 200 });
    mockReadAgentToolEventStream.mockImplementation(async (_response, onEvent) => {
      onEvent({ finalText: "Started.", turnId: "turn-1", type: "turn_completed" });
    });

    const { result } = renderHook(() => useCanvasAgentSession());
    await act(async () => {
      await result.current.sendPrompt("给我生成一张动物运动会图片");
    });

    const createdNode = useFlowCanvasStore.getState().nodes[0]!;
    expect(createdNode.data).toMatchObject({
      generationPrompt: "给我生成一张动物运动会图片",
      kind: "image",
    });
    expect(mockExecuteAgentTurnStream).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        snapshot: expect.objectContaining({
          flowId: "flow-1",
          nodes: [expect.objectContaining({ id: createdNode.id, kind: "image", selected: true })],
          selectedNodeIds: [createdNode.id],
        }),
      }),
    );
    expect(mockCreateAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        flowId: "flow-1",
        projectId: "project-1",
        title: "给我生成一张动物运动会图片",
      }),
    );
  });

  it("flushes the remote draft before executing an auto-created Agent target node", async () => {
    useFlowCanvasStore.getState().setBackendFlowBinding({
      backendFlowId: "flow-1",
      backendProjectId: "project-1",
    });
    const saveNow = vi.fn().mockResolvedValue(undefined);
    registerRemoteDraftSaveBarrier(saveNow);
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: true, status: 200 });
    mockReadAgentToolEventStream.mockImplementation(async (_response, onEvent) => {
      onEvent({ finalText: "Started.", turnId: "turn-1", type: "turn_completed" });
    });

    const { result } = renderHook(() => useCanvasAgentSession());
    await act(async () => {
      await result.current.sendPrompt("给我生成一张动物运动会图片");
    });

    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(mockExecuteAgentTurnStream).toHaveBeenCalledTimes(1);
  });

  it("does not create an extra image node when a runnable image node already exists", async () => {
    useFlowCanvasStore.getState().setBackendFlowBinding({
      backendFlowId: "flow-1",
      backendProjectId: "project-1",
    });
    const existing = useFlowCanvasStore.getState().addNode(
      "image",
      { x: 0, y: 0 },
      { generationPrompt: "old", title: "Existing Image" },
      { selected: true },
    );
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: true, status: 200 });
    mockReadAgentToolEventStream.mockImplementation(async (_response, onEvent) => {
      onEvent({ finalText: "Started.", turnId: "turn-1", type: "turn_completed" });
    });

    const { result } = renderHook(() => useCanvasAgentSession());
    await act(async () => {
      await result.current.sendPrompt("给我生成一张动物运动会图片");
    });

    expect(useFlowCanvasStore.getState().nodes).toHaveLength(1);
    expect(mockExecuteAgentTurnStream).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        snapshot: expect.objectContaining({
          selectedNodeIds: [existing.id],
        }),
      }),
    );
  });

  it("approves a pending tool call through the backend resume stream", async () => {
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: true, status: 200 });
    mockReadAgentToolEventStream
      .mockImplementationOnce(async (_response, onEvent) => {
        onEvent({ toolCallKey: "tool-1", toolName: "generate_image", type: "tool_started" });
        onEvent({ estimate: { totalCredits: 4 }, toolCallKey: "tool-1", turnId: "turn-1", type: "approval_required" });
        onEvent({ finalText: "Confirm credits.", turnId: "turn-1", type: "turn_completed" });
      })
      .mockImplementationOnce(async (_response, onEvent) => {
        onEvent({ toolCallKey: "tool-1", toolName: "generate_image", type: "tool_started" });
        onEvent({
          result: {
            assetRefs: [{ assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" }],
            status: "succeeded",
            toolCallId: "tool-db-1",
          },
          toolCallKey: "tool-1",
          type: "tool_result",
        });
        onEvent({ finalText: "Submitted.", turnId: "turn-1", type: "turn_completed" });
      });

    const { result } = renderHook(() => useCanvasAgentSession());
    await act(async () => {
      await result.current.sendPrompt("Generate an image");
    });
    expect(result.current.toolTimeline[0]?.status).toBe("awaiting_approval");

    await act(async () => {
      await result.current.approveToolCall("tool-1", {
        aspectRatio: "16:9",
        estimatedCredits: 12,
        format: "jpeg",
        modelDisplayName: "Nano Banana Pro",
        moderation: "low",
        modality: "image",
        n: 1,
        quality: "high",
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        routeLabel: "线路二（官方T3）",
        size: "4K",
      });
    });

    expect(mockApproveAgentToolCallStream).toHaveBeenCalledWith("session-1", {
      settings: {
        aspectRatio: "16:9",
        estimatedCredits: 12,
        format: "jpeg",
        modelDisplayName: "Nano Banana Pro",
        moderation: "low",
        modality: "image",
        n: 1,
        quality: "high",
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        routeLabel: "线路二（官方T3）",
        size: "4K",
      },
      toolCallKey: "tool-1",
      turnId: "turn-1",
    });
    expect(result.current.toolTimeline[0]).toMatchObject({
      estimate: expect.objectContaining({
        currentSelection: expect.objectContaining({
          aspectRatio: "16:9",
          modelDisplayName: "Nano Banana Pro",
          routeLabel: "线路二（官方T3）",
          size: "4K",
        }),
      }),
      assetRefs: [expect.objectContaining({ assetId: "asset-1" })],
      status: "succeeded",
      taskId: "tool-db-1",
    });
  });

  it("places successful tool assets onto the canvas without storing URLs", async () => {
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: true, status: 200 });
    mockReadAgentToolEventStream.mockImplementation(async (_response, onEvent) => {
      onEvent({ toolCallKey: "tool-1", toolName: "generate_image", type: "tool_started" });
      onEvent({
        result: {
          assetRefs: [{ assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "forest", refId: "round-1-image-1" }],
          status: "succeeded",
          toolCallId: "tool-db-1",
        },
        toolCallKey: "tool-1",
        type: "tool_result",
      });
      onEvent({ finalText: "Done.", turnId: "turn-1", type: "turn_completed" });
    });

    const { result } = renderHook(() => useCanvasAgentSession());
    await act(async () => {
      await result.current.sendPrompt("Generate an image");
    });
    await act(async () => {
      result.current.placeToolAssetsOnCanvas("tool-1");
    });

    const createdNode = useFlowCanvasStore.getState().nodes[0]!;
    expect(createdNode.data).toMatchObject({ assetId: "asset-1", title: "Round 1 image 1" });
    expect(JSON.stringify(createdNode.data)).not.toMatch(/https?:\/\/|data:|blob:|base64/i);
    expect(result.current.toolTimeline[0]?.placedNodeIds).toHaveLength(1);
  });

  it("automatically places successful generated assets onto the canvas", async () => {
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: true, status: 200 });
    mockReadAgentToolEventStream.mockImplementation(async (_response, onEvent) => {
      onEvent({ toolCallKey: "tool-1", toolName: "generate_image", type: "tool_started" });
      onEvent({
        result: {
          assetRefs: [{ assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "forest", refId: "round-1-image-1" }],
          status: "succeeded",
          toolCallId: "tool-db-1",
        },
        toolCallKey: "tool-1",
        type: "tool_result",
      });
      onEvent({ finalText: "Done.", turnId: "turn-1", type: "turn_completed" });
    });

    const { result } = renderHook(() => useCanvasAgentSession());
    await act(async () => {
      await result.current.sendPrompt("Generate an image");
    });

    const createdNode = useFlowCanvasStore.getState().nodes[0]!;
    expect(createdNode.data).toMatchObject({
      assetId: "asset-1",
      title: "Round 1 image 1",
    });
    expect(result.current.toolTimeline[0]).toMatchObject({
      placedNodeIds: [createdNode.id],
      status: "succeeded",
    });
  });

  it("shows an error instead of silently falling back when offline fallback is not explicitly enabled", async () => {
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockOpenAgentTurnStream.mockResolvedValue({ ok: false, status: 503 });
    mockCreateAgentTurn.mockRejectedValue(
      new V2HttpError({
        message: "server down",
        status: 500,
      }),
    );

    const { result } = renderHook(() => useCanvasAgentSession());
    await act(async () => {
      await result.current.sendPrompt("Help me organize this canvas");
    });

    expect(result.current.currentPlan).toBeNull();
    expect(result.current.error).toContain("server down");
    expect(result.current.status).toBe("error");
  });

  it("falls back to offline planning only when explicitly enabled", async () => {
    vi.stubEnv("VITE_AGENT_OFFLINE_FALLBACK", "true");
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockOpenAgentTurnStream.mockResolvedValue({ ok: false, status: 503 });
    mockCreateAgentTurn.mockRejectedValue(
      new V2HttpError({
        message: "server down",
        status: 500,
      }),
    );

    const { result } = renderHook(() => useCanvasAgentSession());
    await act(async () => {
      await result.current.sendPrompt("Help me organize this canvas");
    });

    expect(result.current.currentPlan?.reply).toContain("Prepare");
    expect(result.current.status).toBe("awaiting_approval");
  });

  it("does not downgrade production image requests to planner or offline node creation when executor is unavailable", async () => {
    vi.stubEnv("VITE_AGENT_OFFLINE_FALLBACK", "true");
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: false, status: 503 });
    mockOpenAgentTurnStream.mockResolvedValue({ ok: true, status: 200 });

    const { result } = renderHook(() => useCanvasAgentSession());
    await act(async () => {
      await result.current.sendPrompt("我要生成一套对比 Nano Banana Pro 和 GPT-Image-2 生图效果的套图，需要 3 张");
    });

    expect(mockOpenAgentTurnStream).not.toHaveBeenCalled();
    expect(mockCreateAgentTurn).not.toHaveBeenCalled();
    expect(result.current.currentPlan).toBeNull();
    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("真实 Agent 执行器不可用");
  });

  it("sends structured continuation context with the next prompt", async () => {
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: true, status: 200 });
    mockReadAgentToolEventStream.mockImplementation(async (_response, onEvent) => {
      onEvent({ finalText: "Done.", turnId: "turn-1", type: "turn_completed" });
    });

    const { result } = renderHook(() => useCanvasAgentSession());

    await act(async () => {
      result.current.setPendingContinuation?.({
        action: "make-poster",
        assetId: "asset-1",
        assetLabel: "Round 1 image 1",
        assetRefId: "round-1-image-1",
      });
    });

    await act(async () => {
      await result.current.sendPrompt("Turn this result into a poster");
    });

    expect(mockExecuteAgentTurnStream).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        continuationContext: expect.objectContaining({
          action: "make-poster",
          assetId: "asset-1",
          assetLabel: "Round 1 image 1",
          assetRefId: "round-1-image-1",
        }),
        prompt: "Turn this result into a poster",
      }),
    );
    expect(mockExecuteAgentTurnStream.mock.calls[0]?.[1]?.continuationContext).not.toHaveProperty("promptSummary");
    expect(result.current.pendingContinuation).toBeNull();
  });

  it("updates the active asset ref for a multi-result tool before continuation", async () => {
    const { result } = renderHook(() => useCanvasAgentSession());

    await act(async () => {
      result.current.hydrateReplayEvents([
        {
          createdAt: "2026-06-24T00:00:01Z",
          eventJson: { toolCallKey: "tool-1", toolName: "generate_image_batch" },
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
                { assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "forest sports day", refId: "round-1-image-1" },
                { assetId: "asset-2", kind: "image", label: "Round 1 image 2", promptSummary: "poster variant", refId: "round-1-image-2" },
              ],
              status: "succeeded",
              toolCallId: "tool-db-2",
            },
            toolCallKey: "tool-1",
          },
          eventType: "tool_result",
          id: "e2",
          seq: 2,
          sessionId: "session-1",
          taskId: "tool-db-2",
          turnId: null,
        },
      ]);
    });

    await act(async () => {
      result.current.selectToolAssetRef?.("tool-1", "round-1-image-2");
    });

    expect(result.current.toolTimeline[0]).toMatchObject({
      activeAssetRefId: "round-1-image-2",
    });
  });

  it("retains the last continuation context after sending so the next turn can reuse the same result set", async () => {
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: true, status: 200 });
    mockReadAgentToolEventStream.mockImplementation(async (_response, onEvent) => {
      onEvent({ finalText: "Done.", turnId: "turn-1", type: "turn_completed" });
    });

    const { result } = renderHook(() => useCanvasAgentSession());

    await act(async () => {
      result.current.setPendingContinuation?.({
        action: "make-poster",
        assetId: "asset-2",
        assetIds: ["asset-1", "asset-2"],
        assetLabel: "Round 1 image 2",
        assetLabels: ["Round 1 image 1", "Round 1 image 2"],
        assetRefId: "round-1-image-2",
        assetRefIds: ["round-1-image-1", "round-1-image-2"],
        promptSummary: "forest sports day",
      });
    });

    await act(async () => {
      await result.current.sendPrompt("Make this into a poster");
    });

    expect(result.current.pendingContinuation).toBeNull();
    expect(result.current.lastContinuation).toMatchObject({
      assetId: "asset-2",
      assetIds: ["asset-1", "asset-2"],
      assetRefIds: ["round-1-image-1", "round-1-image-2"],
    });
  });

  it("notifies the host when server-applied canvas ops should refresh the draft", async () => {
    mockCreateAgentSession.mockResolvedValue({ id: "session-1" });
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: true, status: 200 });
    mockReadAgentToolEventStream.mockImplementation(async (_response, onEvent) => {
      onEvent({
        createdNodeIds: ["node-1"],
        edgeIds: ["edge-1"],
        flowId: "flow-1",
        toolCallKey: "tool-1",
        type: "canvas_op_applied",
        updatedNodeIds: ["node-2"],
      });
      onEvent({ finalText: "Done.", turnId: "turn-1", type: "turn_completed" });
    });
    const onServerDraftApplied = vi.fn();

    const { result } = renderHook(() =>
      useCanvasAgentSession({
        onServerDraftApplied,
      }),
    );

    await act(async () => {
      await result.current.sendPrompt("Organize this canvas");
    });

    expect(onServerDraftApplied).toHaveBeenCalledTimes(1);
  });
});
