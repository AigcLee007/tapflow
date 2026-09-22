export type CanonicalAgentEvent = { id: string; seq: number; eventType: string; eventJson?: Record<string, unknown>; event?: Record<string, unknown> };
export type AgentEventEnvelope = { events: CanonicalAgentEvent[]; lastSeq: number; replayCursor: string | null; resyncRequired: boolean };

/** Normalize polling/SSE/history payloads and ignore duplicate or stale sequence numbers. */
export function reduceAgentEventEnvelope(current: CanonicalAgentEvent[], envelope: AgentEventEnvelope): { events: CanonicalAgentEvent[]; resyncRequired: boolean } {
  const known = new Map(current.map((event) => [event.id, event]));
  let lastSeq = current.reduce((max, event) => Math.max(max, event.seq), 0);
  let resyncRequired = envelope.resyncRequired;
  for (const raw of envelope.events) {
    const event = raw.eventJson ? raw : { ...raw, eventJson: raw.event ?? {} };
    if (event.seq > lastSeq + 1) resyncRequired = true;
    if (event.seq <= lastSeq && !known.has(event.id)) {
      resyncRequired = true;
      continue;
    }
    if (!known.has(event.id)) known.set(event.id, event);
    lastSeq = Math.max(lastSeq, event.seq);
  }
  return { events: [...known.values()].sort((a, b) => a.seq - b.seq), resyncRequired };
}
