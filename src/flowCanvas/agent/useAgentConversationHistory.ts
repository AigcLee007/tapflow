import { useCallback, useMemo, useState } from "react";

import {
  type AgentHistoryMessage,
  type AgentHistoryTurn,
  type AgentSessionView,
  getAgentSessionHistory,
} from "./canvasAgentApi";

export function useAgentConversationHistory(sessionId: string | null) {
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<AgentHistoryMessage[]>([]);
  const [session, setSession] = useState<AgentSessionView | null>(null);
  const [turns, setTurns] = useState<AgentHistoryTurn[]>([]);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setMessages([]);
      setSession(null);
      setTurns([]);
      return;
    }

    setLoading(true);
    try {
      const next = await getAgentSessionHistory(sessionId);
      setMessages(next.messages);
      setSession(next.session);
      setTurns(next.turns);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  return useMemo(() => ({
    loading,
    messages,
    refresh,
    session,
    turns,
  }), [loading, messages, refresh, session, turns]);
}
