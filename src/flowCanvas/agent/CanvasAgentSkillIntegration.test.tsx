import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { useCanvasAgentSessionV2 } from "./v2/useCanvasAgentSessionV2";

const openAgentV2TurnStream = vi.fn();
const readAgentSseStream = vi.fn();
const createAgentSession = vi.fn();
const executeAgentTurnStream = vi.fn();

vi.mock("./canvasAgentApi", () => ({
  cancelAgentTurn: vi.fn().mockResolvedValue({ cancelled: true }),
  createAgentSession: (...args: unknown[]) => createAgentSession(...args),
  executeAgentTurnStream: (...args: unknown[]) => executeAgentTurnStream(...args),
  openAgentV2TurnStream: (...args: unknown[]) => openAgentV2TurnStream(...args),
  openAgentTurnStream: vi.fn(),
  readAgentSseStream: (...args: unknown[]) => readAgentSseStream(...args),
}));

describe("Canvas Agent Skill integration", () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().newProject();
    createAgentSession.mockReset().mockResolvedValue({ id: "session-1" });
    executeAgentTurnStream.mockReset().mockResolvedValue({ ok: false, status: 503 });
    openAgentV2TurnStream.mockReset().mockResolvedValue({ ok: true, status: 200 });
    readAgentSseStream.mockReset().mockImplementation(async (_response, handlers) => {
      handlers.onAgentV2("agent_v2_turn_completed", { text: "已完成" });
    });
  });

  it("binds the selected immutable Skill version to the next Agent turn", async () => {
    const { result } = renderHook(() => useCanvasAgentSessionV2({ v2Enabled: true }));
    act(() => result.current.selectSkill({ id: "skill-1", version: 3 }));
    await act(async () => {
      await result.current.sendPrompt("写一段广告文案");
    });

    expect(openAgentV2TurnStream).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ selectedSkillId: "skill-1", selectedSkillVersion: 3 }),
    );
    expect(result.current.selectedSkill).toEqual({ id: "skill-1", version: 3 });
  });
});
