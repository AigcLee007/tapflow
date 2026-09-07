import { useCallback, useMemo, useRef, useState } from "react";

import { useFlowCanvasStore } from "../../store/flowCanvasStore";
import { buildCanvasAgentSnapshot } from "../canvasAgentSnapshot";
import { createAgentSession, getAgentSessionHistory } from "../canvasAgentApi";
import type { AgentReferenceContext } from "../agentReferenceContext";
import { normalizeAgentV5Blocks } from "./agentV5Blocks";
import { submitAgentV5Decision, submitAgentV5Turn, updateAgentV5Mode, type AgentV5TurnResponse } from "./agentV5Api";
import { initialAgentV5State, reduceAgentV5State } from "./agentV5State";
import type { AgentDecision, AgentExecutionMode, AgentV5Phase, AgentV5State, ConversationBlock, ResultRef } from "./agentV5Types";

type SubmitTextOptions = {
  modelKey?: string | null;
  referenceContext?: AgentReferenceContext;
};

type AgentV5HistoryTurn = {
  blocksJson?: unknown;
  conversationPhase?: unknown;
  id: string;
};

const PHASES = new Set<AgentV5Phase>([
  "idle",
  "understanding",
  "waiting_for_choice",
  "drafting_brief",
  "waiting_for_confirmation",
  "executing",
  "presenting_results",
  "refining",
  "failed",
]);

function buildSessionTitle(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > 36 ? `${normalized.slice(0, 36)}...` : normalized || "新对话";
}

function toPhase(value: unknown, fallback: AgentV5Phase): AgentV5Phase {
  return typeof value === "string" && PHASES.has(value as AgentV5Phase) ? value as AgentV5Phase : fallback;
}

function resultRefsFromBlocks(blocks: ConversationBlock[]): ResultRef[] {
  return blocks.flatMap((block) => block.type === "result_group" ? block.results.map((result) => ({ ...result })) : []);
}

function blocksFromHistory(history: {
  messages: Array<{ content: string; role: string }>;
  turns: AgentV5HistoryTurn[];
}) {
  const turnBlocks = history.turns.map((turn) => ({
    blocks: normalizeAgentV5Blocks(turn.blocksJson),
    turnId: turn.id,
  }));
  const hasStructuredBlocks = turnBlocks.some((turn) => turn.blocks.length > 0);
  return {
    blocks: hasStructuredBlocks
      ? turnBlocks.flatMap((turn) => turn.blocks)
      : normalizeAgentV5Blocks(history.messages.filter((message) => message.role === "assistant").map((message) => message.content)),
    counts: new Map(turnBlocks.map((turn) => [turn.turnId, turn.blocks.length])),
  };
}

/**
 * V5 owns the turn protocol and replay state instead of delegating prompts to
 * the legacy stream, which cannot persist V5 blocks, decisions, and phases.
 */
export function useAgentV5Session() {
  const [state, setState] = useState<AgentV5State>(() => initialAgentV5State());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState("新对话");
  const turnBlockCountsRef = useRef(new Map<string, number>());

  const applyTurnResponse = useCallback((response: AgentV5TurnResponse) => {
    const normalizedBlocks = normalizeAgentV5Blocks(response.blocks);
    const previousCount = turnBlockCountsRef.current.get(response.turnId) ?? 0;
    turnBlockCountsRef.current.set(response.turnId, normalizedBlocks.length);
    setSessionId(response.sessionId || null);
    setState((current) => {
      const blocks = response.turnId && previousCount > 0
        ? [...current.blocks.slice(0, Math.max(0, current.blocks.length - previousCount)), ...normalizedBlocks]
        : [...current.blocks, ...normalizedBlocks];
      const phase = toPhase(response.phase, current.phase);
      return {
        ...current,
        blocks,
        confirmed: phase === "executing" ? current.confirmed : false,
        error: null,
        phase,
        results: resultRefsFromBlocks(blocks),
        sessionId: response.sessionId || current.sessionId,
        turnId: response.turnId || current.turnId,
      };
    });
  }, []);

  const snapshotCanvas = useCallback(() => {
    const canvas = useFlowCanvasStore.getState();
    return buildCanvasAgentSnapshot({
      edges: canvas.edges,
      flowId: canvas.backendFlowId,
      nodeOutputs: canvas.nodeOutputByNodeId,
      nodes: canvas.nodes,
      projectId: canvas.backendProjectId ?? canvas.projectId ?? null,
      viewport: canvas.viewport,
    });
  }, []);

  const ensureSession = useCallback(async (prompt: string) => {
    if (sessionId) return sessionId;
    const canvas = useFlowCanvasStore.getState();
    const created = await createAgentSession({
      flowId: canvas.backendFlowId,
      projectId: canvas.backendProjectId ?? canvas.projectId ?? null,
      title: buildSessionTitle(prompt),
    });
    setSessionId(created.id);
    setSessionTitle(created.title || buildSessionTitle(prompt));
    return created.id;
  }, [sessionId]);

  const submitText = useCallback(async (prompt: string, options: SubmitTextOptions = {}) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setState((current) => reduceAgentV5State(current, { type: "user_submitted", prompt: trimmed }));
    try {
      const activeSessionId = await ensureSession(trimmed);
      const response = await submitAgentV5Turn(activeSessionId, {
        mode: state.mode,
        modelKey: options.modelKey ?? null,
        prompt: trimmed,
        referenceContext: options.referenceContext,
        snapshot: snapshotCanvas(),
      });
      applyTurnResponse({ ...response, sessionId: response.sessionId || activeSessionId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent 暂时无法处理本次请求。";
      setState((current) => reduceAgentV5State(current, { error: message, type: "turn_failed" }));
      throw error;
    }
  }, [applyTurnResponse, ensureSession, snapshotCanvas, state.mode]);

  const submitDecision = useCallback(async (decision: AgentDecision) => {
    if (!sessionId || !state.turnId) return;
    try {
      const response = await submitAgentV5Decision(sessionId, state.turnId, decision as Record<string, unknown>);
      applyTurnResponse({ ...response, sessionId: response.sessionId || sessionId, turnId: response.turnId || state.turnId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent 决策提交失败。";
      setState((current) => reduceAgentV5State(current, { error: message, type: "turn_failed" }));
      throw error;
    }
  }, [applyTurnResponse, sessionId, state.turnId]);

  const openSession = useCallback(async (nextSessionId: string) => {
    const history = await getAgentSessionHistory(nextSessionId);
    const v5History = blocksFromHistory({
      messages: history.messages,
      turns: history.turns as AgentV5HistoryTurn[],
    });
    const latestTurn = history.turns.at(-1) as AgentV5HistoryTurn | undefined;
    turnBlockCountsRef.current = v5History.counts;
    setSessionId(history.session.id);
    setSessionTitle(history.session.title || "新对话");
    setState((current) => initialAgentV5State({
      blocks: v5History.blocks,
      mode: current.mode,
      phase: toPhase(latestTurn?.conversationPhase, v5History.blocks.length ? "presenting_results" : "idle"),
      policy: current.policy,
      results: resultRefsFromBlocks(v5History.blocks),
      sessionId: history.session.id,
      turnId: latestTurn?.id,
    }));
  }, []);

  const newConversation = useCallback(() => {
    turnBlockCountsRef.current.clear();
    setSessionId(null);
    setSessionTitle("新对话");
    setState((current) => initialAgentV5State({ mode: current.mode, policy: current.policy }));
  }, []);

  const setExecutionMode = useCallback((mode: AgentExecutionMode) => {
    setState((current) => ({ ...current, mode }));
    if (sessionId) void updateAgentV5Mode(sessionId, mode).catch(() => undefined);
  }, [sessionId]);

  return useMemo(() => ({
    ...state,
    newConversation,
    openSession,
    sessionId,
    sessionTitle,
    setExecutionMode,
    submitDecision,
    submitText,
  }), [newConversation, openSession, sessionId, sessionTitle, setExecutionMode, state, submitDecision, submitText]);
}
