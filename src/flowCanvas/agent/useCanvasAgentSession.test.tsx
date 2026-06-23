import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { V2HttpError } from "../../services/v2HttpClient";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { useCanvasAgentSession } from "./useCanvasAgentSession";

const mockCreateAgentSession = vi.fn();
const mockCreateAgentTurn = vi.fn();
const mockApproveAgentToolCallStream = vi.fn();
const mockExecuteAgentTurnStream = vi.fn();
const mockOpenAgentTurnStream = vi.fn();
const mockReadAgentSseStream = vi.fn();
const mockReadAgentToolEventStream = vi.fn();

vi.mock("./canvasAgentApi", () => ({
  approveAgentToolCallStream: (...args: unknown[]) => mockApproveAgentToolCallStream(...args),
  createAgentSession: (...args: unknown[]) => mockCreateAgentSession(...args),
  createAgentTurn: (...args: unknown[]) => mockCreateAgentTurn(...args),
  executeAgentTurnStream: (...args: unknown[]) => mockExecuteAgentTurnStream(...args),
  openAgentTurnStream: (...args: unknown[]) => mockOpenAgentTurnStream(...args),
  readAgentSseStream: (...args: unknown[]) => mockReadAgentSseStream(...args),
}));

vi.mock("./canvasAgentToolEvents", () => ({
  readAgentToolEventStream: (...args: unknown[]) => mockReadAgentToolEventStream(...args),
}));

describe("useCanvasAgentSession", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    useFlowCanvasStore.getState().newProject();
    mockCreateAgentSession.mockReset();
    mockCreateAgentTurn.mockReset();
    mockApproveAgentToolCallStream.mockReset();
    mockExecuteAgentTurnStream.mockReset();
    mockOpenAgentTurnStream.mockReset();
    mockReadAgentSseStream.mockReset();
    mockReadAgentToolEventStream.mockReset();
    mockExecuteAgentTurnStream.mockResolvedValue({ ok: false, status: 503 });
    mockApproveAgentToolCallStream.mockResolvedValue({ ok: true, status: 200 });
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
    expect(result.current.toolTimeline).toEqual([
      expect.objectContaining({
        assetRefs: [expect.objectContaining({ assetId: "asset-1" })],
        status: "succeeded",
        toolCallKey: "tool-1",
      }),
    ]);
    expect(result.current.messages.some((message) => message.content.includes("Done."))).toBe(true);
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
      await result.current.approveToolCall("tool-1");
    });

    expect(mockApproveAgentToolCallStream).toHaveBeenCalledWith("session-1", {
      toolCallKey: "tool-1",
      turnId: "turn-1",
    });
    expect(result.current.toolTimeline[0]).toMatchObject({
      assetRefs: [expect.objectContaining({ assetId: "asset-1" })],
      status: "succeeded",
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
    expect(result.current.error).toContain("真实 Agent 执行器");
  });
});
