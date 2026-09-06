import { useCallback, useMemo, useState } from "react";

import { useCanvasAgentSession, type CanvasAgentMessage } from "../useCanvasAgentSession";
import { cancelAgentTurn } from "../canvasAgentApi";
import {
  applyV2AgentEventToSessionState,
  buildV2AgentSessionStateFromEvents,
  createInitialV2AgentSessionState,
} from "../agentReplayState";

/** V2-facing session contract. The legacy hook remains the compatibility implementation. */
export function useCanvasAgentSessionV2(options: Parameters<typeof useCanvasAgentSession>[0] = {}) {
  const [v2State, setV2State] = useState(createInitialV2AgentSessionState);
  const session = useCanvasAgentSession({
    ...options,
    onAgentV2Event: (eventName, data) => {
      options.onAgentV2Event?.(eventName, data);
      setV2State((current) => applyV2AgentEventToSessionState(current, eventName, data));
    },
  });
  const [selectedSkill, setSelectedSkill] = useState<{ id: string; version: number } | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<Record<string, unknown> | null>(null);
  const cancelTurn = useCallback(async (reason?: string) => {
    if (!session.sessionId) return { cancelled: false };
    return cancelAgentTurn(session.sessionId, reason);
  }, [session.sessionId]);
  const sendPrompt = useCallback(async (prompt: string, input?: Parameters<typeof session.sendPrompt>[1]) => {
    setV2State(createInitialV2AgentSessionState());
    setPendingQuestion(null);
    return session.sendPrompt(prompt, {
      ...input,
      ...(selectedSkill ? { selectedSkillId: selectedSkill.id, selectedSkillVersion: selectedSkill.version } : {}),
    });
  }, [selectedSkill, session.sendPrompt]);
  const answerQuestion = useCallback(async (answer: string) => {
    if (!answer.trim()) return;
    setPendingQuestion(null);
    return sendPrompt(answer.trim());
  }, [sendPrompt]);
  const approve = useCallback(async (approvalId: string, selection?: Parameters<typeof session.approveToolCall>[1]) => {
    setPendingApproval(null);
    return session.approveToolCall(approvalId, selection);
  }, [session.approveToolCall]);
  const hydrateReplayEvents = useCallback((events: Parameters<typeof session.hydrateReplayEvents>[0]) => {
    setV2State(buildV2AgentSessionStateFromEvents(events));
    const replaySkill = [...events].reverse().map((event) => {
      const payload = event.eventJson as Record<string, unknown>;
      return typeof payload.selectedSkillId === "string" && Number.isInteger(payload.selectedSkillVersion)
        ? { id: payload.selectedSkillId, version: payload.selectedSkillVersion as number }
        : null;
    }).find((value): value is { id: string; version: number } => value !== null) ?? null;
    setSelectedSkill(replaySkill);
    session.hydrateReplayEvents(events);
  }, [session.hydrateReplayEvents]);
  const resetSession = useCallback(() => {
    setSelectedSkill(null);
    setV2State(createInitialV2AgentSessionState());
    setPendingApproval(null);
    setPendingQuestion(null);
    session.resetSession();
  }, [session.resetSession]);
  const effectiveWorkspaceState =
    v2State.status === "error"
      ? "failed"
      : v2State.status === "awaiting_approval"
        ? "awaiting_credit_confirm"
        : v2State.status === "waiting_for_input"
          ? "awaiting_canvas_confirm"
          : v2State.status === "executing_tool"
            ? "running_workflow"
            : session.workspaceState;
  const selectSkill = useCallback((skill: { id: string; version: number } | null) => setSelectedSkill(skill), []);
  return useMemo(() => ({
    ...session,
    approve,
    answerQuestion,
    cancelTurn,
    conversationBlocks: v2State.conversationBlocks,
    activityTimeline: [...session.activityTimeline, ...v2State.activityTimeline],
    error: v2State.error ?? session.error,
    hydrateReplayEvents,
    pendingApproval: v2State.pendingApproval ?? pendingApproval,
    pendingQuestion: v2State.pendingQuestion ?? pendingQuestion,
    resetSession,
    selectSkill,
    selectedSkill,
    sendPrompt,
    setPendingApproval,
    setPendingQuestion,
    status: effectiveWorkspaceState === "failed"
      ? "error"
      : effectiveWorkspaceState === "awaiting_credit_confirm" || effectiveWorkspaceState === "awaiting_canvas_confirm"
        ? "awaiting_approval"
        : effectiveWorkspaceState === "running_workflow"
          ? "executing_tool"
          : session.status,
    toolTimeline: [...session.toolTimeline, ...v2State.toolTimeline],
    workspaceState: effectiveWorkspaceState,
  }), [answerQuestion, approve, cancelTurn, effectiveWorkspaceState, hydrateReplayEvents, pendingApproval, pendingQuestion, resetSession, selectSkill, selectedSkill, sendPrompt, session, v2State]);
}

export type CanvasAgentSessionV2 = ReturnType<typeof useCanvasAgentSessionV2>;
export type CanvasAgentSessionV2Message = CanvasAgentMessage;
