import { useCallback, useMemo, useState } from "react";
import type { AgentReferenceContext } from "../agentReferenceContext";
import { useCanvasAgentSessionV2 } from "../v2/useCanvasAgentSessionV2";
import { normalizeAgentV5Blocks } from "./agentV5Blocks";
import { initialAgentV5State, reduceAgentV5State } from "./agentV5State";
import type { AgentExecutionMode, AgentV5State, ConversationBlock } from "./agentV5Types";

export function useAgentV5Session(options: Parameters<typeof useCanvasAgentSessionV2>[0] = {}) {
  const legacy = useCanvasAgentSessionV2(options);
  const [mode, setMode] = useState<AgentExecutionMode>("manual_confirmation");
  const [state, setState] = useState<AgentV5State>(() => initialAgentV5State());
  const blocks = useMemo<ConversationBlock[]>(() => {
    const raw = legacy.conversationBlocks as unknown as unknown[];
    return normalizeAgentV5Blocks(raw.length ? raw : legacy.messages.map((message) => message.content));
  }, [legacy.conversationBlocks, legacy.messages]);
  const submitText = useCallback(async (prompt: string, referenceContext?: AgentReferenceContext) => {
    setState((current) => reduceAgentV5State(current, { type: "user_submitted", prompt }));
    return legacy.sendPrompt(prompt, { referenceContext });
  }, [legacy.sendPrompt]);
  const setExecutionMode = useCallback((next: AgentExecutionMode) => setMode(next), []);
  return useMemo(() => ({
    ...legacy,
    blocks,
    mode,
    phase: state.phase,
    setExecutionMode,
    submitText,
  }), [blocks, legacy, mode, setExecutionMode, state.phase, submitText]);
}
