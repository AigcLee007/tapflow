import type { AgentRuntimeEvent } from "./agentRuntimeApi";
import type { AgentTurnResponse } from "./agentProtocol";

export type AgentRuntimeState = {
  sessionId: string | null;
  turns: AgentTurnResponse[];
  latest: AgentTurnResponse | null;
  events: AgentRuntimeEvent[];
  replayCursor: string | null;
  lastSeq: number;
};

export const initialAgentRuntimeState = (): AgentRuntimeState => ({ sessionId: null, turns: [], latest: null, events: [], replayCursor: null, lastSeq: 0 });

function replaceTurn(turns: AgentTurnResponse[], next: AgentTurnResponse) {
  const index = turns.findIndex((turn) => turn.turnId === next.turnId);
  if (index < 0) return [...turns, next];
  return turns.map((turn, position) => position === index ? next : turn);
}

export function reduceAgentTurn(state: AgentRuntimeState, response: AgentTurnResponse): AgentRuntimeState {
  return { ...state, sessionId: response.sessionId, turns: replaceTurn(state.turns, response), latest: response, replayCursor: response.replayCursor, lastSeq: state.lastSeq };
}

export function reduceAgentEvents(state: AgentRuntimeState, events: readonly AgentRuntimeEvent[], cursor: string | null, lastSeq: number): AgentRuntimeState {
  let next = { ...state, events: [...state.events, ...events], replayCursor: cursor ?? state.replayCursor, lastSeq: Math.max(state.lastSeq, lastSeq) };
  for (const event of events) {
    const payload = event.event;
    const response = payload && typeof payload === "object" && "response" in payload ? (payload as { response?: AgentTurnResponse }).response : undefined;
    if (response && typeof response === "object") next = reduceAgentTurn(next, response);
    // Unknown, scope-valid events are intentionally retained and advance the
    // cursor. The reducer must never drop the stream on a new server event.
  }
  return next;
}

export function reduceAgentHistory(state: AgentRuntimeState, turns: readonly AgentTurnResponse[], replayCursor: string | null = null): AgentRuntimeState {
  const latest = turns.at(-1) ?? null;
  return { ...state, sessionId: latest?.sessionId ?? state.sessionId, turns: [...turns], latest, replayCursor, lastSeq: state.lastSeq };
}
