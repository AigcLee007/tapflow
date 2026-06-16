import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { V2HttpError } from "../../services/v2HttpClient";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { useCanvasAgentSession } from "./useCanvasAgentSession";

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

describe("useCanvasAgentSession", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    useFlowCanvasStore.getState().newProject();
    mockCreateAgentSession.mockReset();
    mockCreateAgentTurn.mockReset();
    mockOpenAgentTurnStream.mockReset();
    mockReadAgentSseStream.mockReset();
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
      await result.current.sendPrompt("帮我生成图片");
    });

    expect(result.current.messages.at(-1)?.content).toBe("服务端计划");
    expect(result.current.status).toBe("awaiting_approval");
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
      await result.current.sendPrompt("Help me make a forest sports day image");
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
      await result.current.sendPrompt("Help me make a forest sports day image");
    });

    expect(result.current.currentPlan?.reply).toContain("Prepare");
    expect(result.current.status).toBe("awaiting_approval");
  });
});
