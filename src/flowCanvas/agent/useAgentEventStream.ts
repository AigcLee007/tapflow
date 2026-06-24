import { useCallback, useMemo, useState } from "react";

import {
  type AgentSessionEvent,
  getAgentSessionEvents,
  openAgentSessionEventStream,
  readAgentSseStream,
} from "./canvasAgentApi";

function mergeUniqueById(current: AgentSessionEvent[], incoming: AgentSessionEvent[]) {
  const map = new Map<string, AgentSessionEvent>();
  for (const event of current) map.set(event.id, event);
  for (const event of incoming) map.set(event.id, event);
  return Array.from(map.values()).sort((left, right) => left.seq - right.seq);
}

export function useAgentEventStream(sessionId: string | null) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<AgentSessionEvent[]>([]);

  const connect = useCallback(async () => {
    if (!sessionId) {
      setEvents([]);
      setConnected(false);
      return;
    }

    const replay = await getAgentSessionEvents(sessionId, {
      afterSeq: events.at(-1)?.seq ?? 0,
    });
    setEvents((current) => mergeUniqueById(current, replay.events));

    const response = await openAgentSessionEventStream(sessionId, {
      afterSeq: replay.events.at(-1)?.seq ?? events.at(-1)?.seq ?? 0,
    });
    if (!response.ok) {
      throw new Error(`Agent event stream failed with status ${response.status}`);
    }

    setConnected(true);
    await readAgentSseStream(response, {
      onDone: () => setConnected(false),
      onEvent: (data) => {
        setEvents((current) => mergeUniqueById(current, [data as AgentSessionEvent]));
      },
    });
  }, [events, sessionId]);

  return useMemo(() => ({
    connect,
    connected,
    events,
  }), [connect, connected, events]);
}
