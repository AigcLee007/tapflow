import { describe, expect, it } from "vitest";

import {
  cancelAgentTurnSchema,
  getAgentEventsQuerySchema,
  updateAgentV5ModeSchema,
} from "../src/modules/agent/agent.schemas.js";

describe("Agent V6 server contracts", () => {
  it("requires an explicit scoped turn target for cancellation", () => {
    expect(() => cancelAgentTurnSchema.parse({ reason: "stop" })).toThrow();
    expect(cancelAgentTurnSchema.parse({
      turnId: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
      flowId: "33333333-3333-4333-8333-333333333333",
      graphRevision: 4,
      idempotencyKey: "cancel-1",
    })).toMatchObject({ turnId: "11111111-1111-4111-8111-111111111111", projectId: "22222222-2222-4222-8222-222222222222" });
  });

  it("accepts project and flow scope on mode and event replay requests", () => {
    expect(updateAgentV5ModeSchema.parse({ mode: "auto", projectId: null, flowId: null, graphRevision: 2 })).toMatchObject({ mode: "auto", graphRevision: 2 });
    expect(getAgentEventsQuerySchema.parse({ projectId: "22222222-2222-4222-8222-222222222222", flowId: "33333333-3333-4333-8333-333333333333", afterSeq: "4" })).toMatchObject({ afterSeq: 4 });
  });
});
