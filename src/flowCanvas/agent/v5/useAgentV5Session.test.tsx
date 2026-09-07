import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFlowCanvasStore } from "../../store/flowCanvasStore";
import { useAgentV5Session } from "./useAgentV5Session";

const createAgentSession = vi.fn();
const getAgentSessionHistory = vi.fn();
const submitAgentV5Decision = vi.fn();
const submitAgentV5Turn = vi.fn();

vi.mock("../canvasAgentApi", () => ({
  createAgentSession: (...args: unknown[]) => createAgentSession(...args),
  getAgentSessionHistory: (...args: unknown[]) => getAgentSessionHistory(...args),
}));

vi.mock("./agentV5Api", () => ({
  submitAgentV5Decision: (...args: unknown[]) => submitAgentV5Decision(...args),
  submitAgentV5Turn: (...args: unknown[]) => submitAgentV5Turn(...args),
}));

describe("useAgentV5Session", () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().newProject();
    useFlowCanvasStore.getState().setBackendFlowBinding({
      backendFlowId: "00000000-0000-4000-8000-000000000001",
      backendProjectId: "00000000-0000-4000-8000-000000000002",
    });
    createAgentSession.mockReset().mockResolvedValue({
      createdAt: "2026-09-06T00:00:00.000Z",
      flowId: "00000000-0000-4000-8000-000000000001",
      id: "00000000-0000-4000-8000-000000000003",
      projectId: "00000000-0000-4000-8000-000000000002",
      title: "设计儿童陪伴玩具",
    });
    getAgentSessionHistory.mockReset();
    submitAgentV5Decision.mockReset();
    submitAgentV5Turn.mockReset().mockResolvedValue({
      blocks: [
        { text: "我先确认两个关键选择。", type: "paragraph" },
        {
          id: "direction",
          options: [{ id: "comfort", label: "陪伴与情绪安抚" }],
          selectionMode: "single",
          title: "优先方向",
          type: "choice_grid",
        },
      ],
      phase: "waiting_for_choice",
      sessionId: "00000000-0000-4000-8000-000000000003",
      turnId: "00000000-0000-4000-8000-000000000004",
    });
  });

  it("creates a V5 session, snapshots the canvas, and applies the returned blocks", async () => {
    const selectedNode = useFlowCanvasStore.getState().addNode(
      "image",
      { x: 12, y: 24 },
      { assetId: "asset-canvas-1", title: "角色参考" },
      { selected: true },
    );
    const { result } = renderHook(() => useAgentV5Session());

    await act(async () => {
      await result.current.submitText("设计儿童陪伴玩具", {
        modelKey: "text.default",
        referenceContext: {
          items: [{ assetId: "asset-upload-1", kind: "upload", label: "小黄人参考", refId: "upload-1" }],
        },
      });
    });

    expect(createAgentSession).toHaveBeenCalledWith({
      flowId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      title: "设计儿童陪伴玩具",
    });
    expect(submitAgentV5Turn).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000003",
      expect.objectContaining({
        mode: "manual_confirmation",
        modelKey: "text.default",
        prompt: "设计儿童陪伴玩具",
        referenceContext: {
          items: [{ assetId: "asset-upload-1", kind: "upload", label: "小黄人参考", refId: "upload-1" }],
        },
        snapshot: expect.objectContaining({
          flowId: "00000000-0000-4000-8000-000000000001",
          nodes: [expect.objectContaining({ assetId: "asset-canvas-1", id: selectedNode.id, selected: true })],
          projectId: "00000000-0000-4000-8000-000000000002",
          selectedNodeIds: [selectedNode.id],
        }),
      }),
    );
    expect(result.current).toMatchObject({
      blocks: [expect.objectContaining({ type: "paragraph" }), expect.objectContaining({ id: "direction", type: "choice_grid" })],
      phase: "waiting_for_choice",
      sessionId: "00000000-0000-4000-8000-000000000003",
      turnId: "00000000-0000-4000-8000-000000000004",
    });
  });

  it("submits structured decisions against the active V5 turn and applies its phase", async () => {
    submitAgentV5Decision.mockResolvedValue({
      blocks: [{ editable: true, fields: [{ label: "目标", value: "陪伴与情绪安抚" }], type: "brief_card" }],
      phase: "drafting_brief",
      sessionId: "00000000-0000-4000-8000-000000000003",
      turnId: "00000000-0000-4000-8000-000000000004",
    });
    const { result } = renderHook(() => useAgentV5Session());

    await act(async () => {
      await result.current.submitText("设计儿童陪伴玩具");
    });
    await act(async () => {
      await result.current.submitDecision({ blockId: "direction", optionId: "comfort", type: "select_choice" });
    });

    expect(submitAgentV5Decision).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000004",
      { blockId: "direction", optionId: "comfort", type: "select_choice" },
    );
    expect(result.current).toMatchObject({
      blocks: [expect.objectContaining({ type: "brief_card" })],
      phase: "drafting_brief",
    });
  });

  it("hydrates durable V5 blocks and phase when opening a historical session", async () => {
    getAgentSessionHistory.mockResolvedValue({
      messages: [{ content: "旧版文本回退", createdAt: "2026-09-05T00:00:00.000Z", id: "message-1", role: "assistant", sessionId: "00000000-0000-4000-8000-000000000011" }],
      session: {
        createdAt: "2026-09-05T00:00:00.000Z",
        flowId: "00000000-0000-4000-8000-000000000001",
        id: "00000000-0000-4000-8000-000000000011",
        projectId: "00000000-0000-4000-8000-000000000002",
        title: "儿童玩具共创",
      },
      turns: [{
        blocksJson: [{ plan: { costCredits: 12 }, text: "确认后开始", type: "confirmation_card" }],
        conversationPhase: "waiting_for_confirmation",
        createdAt: "2026-09-05T00:00:01.000Z",
        id: "00000000-0000-4000-8000-000000000012",
        sessionId: "00000000-0000-4000-8000-000000000011",
        status: "planned",
        updatedAt: "2026-09-05T00:00:01.000Z",
      }],
    });
    const { result } = renderHook(() => useAgentV5Session());

    await act(async () => {
      await result.current.openSession("00000000-0000-4000-8000-000000000011");
    });

    expect(getAgentSessionHistory).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000011");
    expect(result.current).toMatchObject({
      blocks: [expect.objectContaining({ type: "confirmation_card" })],
      phase: "waiting_for_confirmation",
      sessionId: "00000000-0000-4000-8000-000000000011",
      sessionTitle: "儿童玩具共创",
      turnId: "00000000-0000-4000-8000-000000000012",
    });
  });
});
