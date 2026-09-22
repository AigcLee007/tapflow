import { describe, expect, it } from "vitest";
import { agentRuntimeDecisionSchema } from "../src/modules/agent/runtime/agent-runtime.schemas.js";
const base = { decisionId: "decision", blockId: "approval", graphRevision: 4, idempotencyKey: "request" };
describe("canonical decisions", () => {
  it("accepts only the typed response and stable decision binding", () => {
    expect(agentRuntimeDecisionSchema.parse({ ...base, type: "approve_plan", payload: {} })).toMatchObject(base);
    expect(agentRuntimeDecisionSchema.parse({ ...base, type: "answer_question", payload: { answers: { subject: "robot" } } }).payload).toEqual({ answers: { subject: "robot" } });
  });
  it("rejects browser-supplied permission, pricing, route, snapshot and media", () => {
    for (const payload of [{ permission: true }, { pricing: { credits: 0 } }, { route: { active: true } }, { snapshot: {} }, { answers: { subject: "data:image/png;base64,AAAA" } }]) {
      expect(() => agentRuntimeDecisionSchema.parse({ ...base, type: "approve_plan", payload })).toThrow();
    }
    expect(() => agentRuntimeDecisionSchema.parse({ ...base, type: "answer_question", payload: { answers: { subject: "data:image/png;base64,AAAA" } } })).toThrow();
  });
});
