import { describe, expect, it } from "vitest";
import { reduceAgentEventEnvelope } from "./agentEventReducer";

describe("canonical Agent event reducer", () => {
  it("deduplicates events and flags stale sequence gaps", () => {
    const first = { id: "a", seq: 1, eventType: "snapshot", eventJson: {} };
    const result = reduceAgentEventEnvelope([first], { events: [{ id: "a", seq: 1, eventType: "snapshot", eventJson: {} }, { id: "c", seq: 3, eventType: "done", eventJson: {} }], lastSeq: 3, replayCursor: "c", resyncRequired: false });
    expect(result.events.map((event) => event.id)).toEqual(["a", "c"]);
    expect(result.resyncRequired).toBe(true);
    const stale = reduceAgentEventEnvelope(result.events, { events: [{ id: "b", seq: 2, eventType: "progress", eventJson: {} }], lastSeq: 3, replayCursor: "c", resyncRequired: false });
    expect(stale.resyncRequired).toBe(true);
  });
});
