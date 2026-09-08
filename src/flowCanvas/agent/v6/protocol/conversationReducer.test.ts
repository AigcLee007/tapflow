import { describe, expect, it } from "vitest";
import {
  canExecuteDecision,
  initialConversationState,
  reduceConversation,
} from "./conversationReducer";

describe("Agent V6 conversation reducer", () => {
  it("keeps an ambiguous prompt in choice state", () => {
    const state = reduceConversation(initialConversationState(), {
      type: "turn_submitted",
      prompt: "设计一个儿童陪伴玩具",
    });
    expect(state.phase).toBe("understanding");

    const next = reduceConversation(state, { type: "choice_requested", id: "direction" });
    expect(next.phase).toBe("waiting_for_choice");
  });

  it("requires confirmation for paid canvas writes", () => {
    const state = reduceConversation(initialConversationState(), {
      type: "brief_ready",
      plan: { costCredits: 12, writesCanvas: true },
      graphRevision: 0,
    });
    expect(state.phase).toBe("waiting_for_confirmation");
    expect(canExecuteDecision(state, {
      type: "execute",
      decisionId: "decision-1",
      sessionId: "session-1",
      turnId: "turn-1",
      graphRevision: 0,
      payload: {},
      idempotencyKey: "idem-1",
      costCredits: 12,
      writesCanvas: true,
    })).toBe(false);
  });

  it("tracks execution state and requires matching confirmation metadata", () => {
    let state = initialConversationState({ sessionId: "session-1", turnId: "turn-1", graphRevision: 4 });
    state = reduceConversation(state, { type: "brief_ready", decisionId: "decision-1", plan: { costCredits: 12 }, graphRevision: 4 });
    expect(state.executionState).toBe("idle");
    expect(reduceConversation(state, { type: "confirmation_granted", decisionId: "wrong", graphRevision: 4 }).phase).toBe("waiting_for_confirmation");
    expect(reduceConversation(state, { type: "confirmation_granted", decisionId: "decision-1", graphRevision: 3 }).phase).toBe("waiting_for_confirmation");
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "decision-1", graphRevision: 4 });
    expect(state.phase).toBe("executing");
    expect(state.confirmed).toBe(true);
    expect(state.executionState).toBe("running");
    expect(reduceConversation(state, { type: "execution_started" }).executionState).toBe("running");
    state = reduceConversation(state, { type: "verification_started" });
    expect(state.executionState).toBe("verifying");
  });

  it("only permits execution decisions during executing, never during verification", () => {
    let state = initialConversationState({ sessionId: "session-1", turnId: "turn-1", graphRevision: 1 });
    state = reduceConversation(state, { type: "brief_ready", decisionId: "decision-1", plan: { costCredits: 0 }, graphRevision: 1 });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "decision-1", graphRevision: 1 });
    const decision = { type: "execute" as const, decisionId: "decision-1", sessionId: "session-1", turnId: "turn-1", graphRevision: 1, payload: {}, idempotencyKey: "decision-1", costCredits: 0 };
    expect(canExecuteDecision(state, decision)).toBe(true);
    state = reduceConversation(state, { type: "verification_started" });
    expect(state.phase).toBe("verifying");
    expect(canExecuteDecision(state, decision)).toBe(false);
  });

  it("rejects execution decisions whose metadata or risk differs from the confirmed plan", () => {
    let state = initialConversationState({ sessionId: "session-1", turnId: "turn-1", graphRevision: 2 });
    state = reduceConversation(state, { type: "brief_ready", decisionId: "decision-1", plan: { costCredits: 12, writesCanvas: true }, graphRevision: 2 });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "decision-1", graphRevision: 2 });
    const base = { type: "execute" as const, decisionId: "decision-1", sessionId: "session-1", turnId: "turn-1", graphRevision: 2, payload: {}, idempotencyKey: "decision-1", costCredits: 12, writesCanvas: true };
    expect(canExecuteDecision(state, { ...base, graphRevision: 3 })).toBe(false);
    expect(canExecuteDecision(state, { ...base, writesCanvas: false })).toBe(false);
    expect(canExecuteDecision(state, { ...base, costCredits: 11 })).toBe(false);
    expect(canExecuteDecision(state, base)).toBe(true);
    expect(canExecuteDecision(state, { ...base, idempotencyKey: "x".repeat(201) })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "x".repeat(4_001) } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, costCredits: Number.POSITIVE_INFINITY })).toBe(false);
    expect(canExecuteDecision(state, { ...base, idempotencyKey: "different-idempotency" })).toBe(false);
  });

  it("requires execution payload to match the approved payload exactly", () => {
    let state = initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 0 });
    state = reduceConversation(state, { type: "brief_ready", decisionId: "d", graphRevision: 0, payload: { prompt: "approved", fields: { tone: "calm" } } });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "d", graphRevision: 0 });
    const base = { type: "execute" as const, decisionId: "d", sessionId: "s", turnId: "t", graphRevision: 0, idempotencyKey: "d", costCredits: 0 };
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", fields: { tone: "calm" } } })).toBe(true);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "replaced", fields: { tone: "calm" } } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", fields: { tone: "calm", route: "internal" } } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", asset: "data:image/png;base64,secret" } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", credential: "secret" } })).toBe(false);
  });

  it("rejects sensitive keys nested inside parameters and keeps safe fields comparable", () => {
    let state = initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 0 });
    state = reduceConversation(state, {
      type: "brief_ready",
      decisionId: "d",
      graphRevision: 0,
      payload: { prompt: "approved", parameters: { apiKey: "secret", signed_url: "temporary", baseUrl: "internal", safe: "ok" } },
    });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "d", graphRevision: 0 });
    const base = { type: "execute" as const, decisionId: "d", sessionId: "s", turnId: "t", graphRevision: 0, idempotencyKey: "d", costCredits: 0 };
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", parameters: { safe: "ok" } } })).toBe(true);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", parameters: { safe: "ok", api_key: "secret" } } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", parameters: { safe: "ok", "signed-url": "temporary" } } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", parameters: { safe: "ok", "base-url": "internal" } } })).toBe(false);
  });

  const expectSensitiveKeysToBeRemoved = (sensitiveKeyVariants: string[]) => {
    for (const key of sensitiveKeyVariants) {
      const state = reduceConversation(initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 0 }), {
        type: "brief_ready",
        decisionId: "d",
        graphRevision: 0,
        payload: { prompt: "approved", parameters: { safe: "ok", [key]: "sensitive" } },
      });
      expect(state.pendingDecision?.payload, key).toEqual({ prompt: "approved", parameters: { safe: "ok" } });
      expect(state.phase, key).toBe("waiting_for_confirmation");
    }
  };

  it("rejects provider, route, and credential key variants recursively", () => {
    expectSensitiveKeysToBeRemoved(["provider", "route", "credential", "credentialId", "credential_id", "credential-id"]);
  });

  it("rejects API and client secret key variants recursively", () => {
    expectSensitiveKeysToBeRemoved(["apiKey", "api_key", "api-key", "apiSecret", "api_secret", "api-secret", "clientSecret", "client_secret", "client-secret"]);
  });

  it("rejects private and token key variants recursively", () => {
    expectSensitiveKeysToBeRemoved(["privateKey", "private_key", "private-key", "refreshToken", "refresh_token", "refresh-token", "accessToken", "access_token", "access-token"]);
  });

  it("rejects auth, URL, and content secret key variants recursively", () => {
    expectSensitiveKeysToBeRemoved(["authTag", "auth_tag", "auth-tag", "nonce", "baseUrl", "base_url", "base-url", "signedUrl", "signed_url", "signed-url", "authorization", "token", "secret", "password", "html", "data", "blob", "base64"]);
  });

  it("rejects token-like and encoded sensitive string values", () => {
    let state = initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 0 });
    state = reduceConversation(state, { type: "brief_ready", decisionId: "d", graphRevision: 0, payload: {} });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "d", graphRevision: 0 });
    const base = { type: "execute" as const, decisionId: "d", sessionId: "s", turnId: "t", graphRevision: 0, idempotencyKey: "d", costCredits: 0 };
    expect(canExecuteDecision(state, { ...base, payload: { value: "Bearer abc.def.ghi" } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { value: "A".repeat(80) + "=" } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { value: "Authorization: Bearer secret-token" } })).toBe(false);
  });

  it("returns failed conversations to explicit retry, revise, and recover phases", () => {
    let state = initialConversationState({ sessionId: "session-1", turnId: "turn-1", graphRevision: 0 });
    state = reduceConversation(state, { type: "brief_ready", plan: { costCredits: 0 }, graphRevision: 0 });
    expect(state.pendingDecision?.decisionId).toBe("decision:session-1:turn-1:0");
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "decision:session-1:turn-1:0", graphRevision: 0 });
    const failed = reduceConversation(state, { type: "turn_failed", error: "错误" });
    const retried = reduceConversation(failed, { type: "retry" });
    expect(retried.phase).toBe("executing");
    expect(retried.pendingDecision?.decisionId).toBe("decision:session-1:turn-1:0");
    expect(retried.confirmed).toBe(true);
    expect(canExecuteDecision(retried, retried.pendingDecision!)).toBe(true);
    const revised = reduceConversation(failed, { type: "revise" });
    expect(revised.phase).toBe("drafting_brief");
    expect(revised.pendingDecision).not.toBeNull();
    expect(revised.confirmed).toBe(false);
    const recovered = reduceConversation(failed, { type: "recover" });
    expect(recovered.phase).toBe("understanding");
    expect(recovered.pendingDecision).not.toBeNull();
    expect(recovered.confirmed).toBe(false);
  });

  it("binds brief decisions and context to a finite non-negative event revision", () => {
    let state = initialConversationState({ sessionId: "session-1", turnId: "turn-1", graphRevision: 1 });
    state = reduceConversation(state, { type: "brief_ready", plan: {}, graphRevision: 7 });
    expect(state.graphRevision).toBe(7);
    expect(state.contextSnapshot.graphRevision).toBe(7);
    expect(state.pendingDecision?.graphRevision).toBe(7);
    expect(reduceConversation(state, { type: "brief_ready", graphRevision: Number.NaN }).phase).toBe("waiting_for_confirmation");
    expect(reduceConversation(state, { type: "brief_ready", graphRevision: Number.POSITIVE_INFINITY }).graphRevision).toBe(7);
    expect(reduceConversation(state, { type: "brief_ready", graphRevision: -1 }).graphRevision).toBe(7);
  });

  it("uses the event revision when a refinement produces a new brief", () => {
    let state = initialConversationState({ sessionId: "session-1", turnId: "turn-1", graphRevision: 2 });
    state = reduceConversation(state, { type: "brief_ready", decisionId: "old", plan: {}, graphRevision: 2 });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "old", graphRevision: 2 });
    state = reduceConversation(state, { type: "verification_started" });
    state = reduceConversation(state, { type: "results_presented" });
    state = reduceConversation(state, { type: "refinement_requested", resultId: "result-1" });
    state = reduceConversation(state, { type: "brief_ready", decisionId: "new", plan: { writesCanvas: true }, graphRevision: 9 });
    expect(state.phase).toBe("waiting_for_confirmation");
    expect(state.graphRevision).toBe(9);
    expect(state.contextSnapshot.graphRevision).toBe(9);
    expect(state.pendingDecision?.decisionId).toBe("new");
    expect(state.pendingDecision?.graphRevision).toBe(9);
  });

  it("keeps confirmed high-risk plan metadata through recovery", () => {
    let state = initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 1 });
    state = reduceConversation(state, { type: "brief_ready", decisionId: "d", plan: { costCredits: 4, batch: true, writesCanvas: true, skill: true, app: true, title: "Plan" }, graphRevision: 1 });
    const plan = state.plan;
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "d", graphRevision: 1 });
    const failed = reduceConversation(state, { type: "turn_failed", error: "failed" });
    for (const event of [{ type: "retry" as const }, { type: "revise" as const }, { type: "recover" as const }]) {
      const recovered = reduceConversation(failed, event);
      expect(recovered.plan).toEqual(plan);
      expect(recovered.pendingDecision).toEqual(failed.pendingDecision);
    }
  });

  it("keeps an unconfirmed high-risk recovery behind confirmation", () => {
    let state = initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 1 });
    state = reduceConversation(state, { type: "brief_ready", decisionId: "d", plan: { costCredits: 4, writesCanvas: true }, graphRevision: 1 });
    const failed = reduceConversation(state, { type: "turn_failed", error: "failed" });
    for (const event of [{ type: "retry" as const }, { type: "revise" as const }, { type: "recover" as const }]) {
      const recovered = reduceConversation(failed, event);
      expect(recovered.phase).toBe("waiting_for_confirmation");
      expect(recovered.confirmed).toBe(false);
      expect(recovered.pendingDecision).not.toBeNull();
      expect(canExecuteDecision(recovered, recovered.pendingDecision!)).toBe(false);
    }
  });

  it("keeps manual low-risk retries behind confirmation", () => {
    let state = initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 1, mode: "manual_confirmation" });
    state = reduceConversation(state, { type: "brief_ready", decisionId: "d", plan: {}, graphRevision: 1 });
    const failed = reduceConversation(state, { type: "turn_failed", error: "failed" });
    const retried = reduceConversation(failed, { type: "retry" });
    expect(retried.phase).toBe("waiting_for_confirmation");
    expect(retried.executionState).toBe("idle");
    expect(retried.confirmed).toBe(false);
    expect(retried.pendingDecision).not.toBeNull();
    expect(canExecuteDecision(retried, retried.pendingDecision!)).toBe(false);

    const confirmed = reduceConversation(retried, { type: "confirmation_granted", decisionId: "d", graphRevision: 1 });
    expect(confirmed.phase).toBe("executing");
    expect(confirmed.confirmed).toBe(true);
    expect(canExecuteDecision(confirmed, confirmed.pendingDecision!)).toBe(true);
  });

  it("returns false instead of throwing for unsafe payloads", () => {
    let state = initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 0 });
    state = reduceConversation(state, { type: "brief_ready", decisionId: "d", plan: {}, graphRevision: 0 });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "d", graphRevision: 0 });
    const base = { type: "execute" as const, decisionId: "d", sessionId: "s", turnId: "t", graphRevision: 0, idempotencyKey: "i", costCredits: 0 };
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => canExecuteDecision(state, { ...base, payload: circular })).not.toThrow();
    expect(canExecuteDecision(state, { ...base, payload: circular })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { value: BigInt(1) } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: new Date() as unknown as Record<string, unknown> })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { value: "x".repeat(4_001) } })).toBe(false);
  });

  it("rejects deeply nested and oversized payloads without overflowing the stack", () => {
    let state = initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 0 });
    state = reduceConversation(state, { type: "brief_ready", decisionId: "d", plan: {}, graphRevision: 0 });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "d", graphRevision: 0 });
    const base = { type: "execute" as const, decisionId: "d", sessionId: "s", turnId: "t", graphRevision: 0, idempotencyKey: "d", costCredits: 0 };

    const deeplyNested: Record<string, unknown> = {};
    let cursor = deeplyNested;
    for (let index = 0; index < 10_000; index += 1) {
      const next: Record<string, unknown> = {};
      cursor.value = next;
      cursor = next;
    }
    expect(() => canExecuteDecision(state, { ...base, payload: { value: deeplyNested } })).not.toThrow();
    expect(canExecuteDecision(state, { ...base, payload: { value: deeplyNested } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { value: Array.from({ length: 33 }, () => "x") } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { value: Array.from({ length: 257 }, () => "x") } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`field${index}`, "x"])) })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { value: "x".repeat(4_001) } })).toBe(false);
  });

  it("rejects oversized approved payloads instead of normalizing them into executable data", () => {
    const state = reduceConversation(initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 0 }), {
      type: "brief_ready",
      decisionId: "d",
      graphRevision: 0,
      payload: { value: Array.from({ length: 33 }, () => "x") },
    });
    expect(state.phase).toBe("idle");
    expect(state.pendingDecision).toBeNull();
  });

  it("preserves graph revision when resetting", () => {
    const state = initialConversationState({ graphRevision: 12 });
    const reset = reduceConversation(state, { type: "reset" });
    expect(reset.phase).toBe("idle");
    expect(reset.graphRevision).toBe(12);
    expect(reset.contextSnapshot.graphRevision).toBe(12);
  });

  it("generates the same required decision ID when brief_ready omits one", () => {
    const first = reduceConversation(initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 3 }), { type: "brief_ready", graphRevision: 3 });
    const second = reduceConversation(initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 3 }), { type: "brief_ready", graphRevision: 3 });
    expect(first.pendingDecision?.decisionId).toBe("decision:s:t:3");
    expect(second.pendingDecision?.decisionId).toBe(first.pendingDecision?.decisionId);
    expect(first.pendingDecision?.sessionId).toBe("s");
    expect(first.pendingDecision?.turnId).toBe("t");
  });

  it("normalizes invalid initial graph revisions", () => {
    expect(initialConversationState({ graphRevision: -1 }).graphRevision).toBe(0);
    expect(initialConversationState({ graphRevision: Number.NaN }).contextSnapshot.graphRevision).toBe(0);
    expect(initialConversationState({ graphRevision: Number.POSITIVE_INFINITY }).graphRevision).toBe(0);
  });

  it("safely degrades malformed context arrays and nested references", () => {
    expect(() => initialConversationState({
      contextSnapshot: {
        projectId: { nested: true },
        flowId: ["flow"],
        selectedNodeIds: { slice: "not a function" },
        assetRefs: [{ assetId: { bad: true }, refId: null, label: { bad: true }, nodeId: { bad: true } }, "invalid"],
        uploadedAssetIds: "not-an-array",
        skillRefs: [{ id: { bad: true }, version: "bad" }, null],
        appRefs: null,
        modelKey: { bad: true },
        graphRevision: Number.NaN,
      } as never,
    })).not.toThrow();
    const state = initialConversationState({
      contextSnapshot: { selectedNodeIds: {}, assetRefs: {}, uploadedAssetIds: null, skillRefs: {}, appRefs: "bad", graphRevision: 2 } as never,
    });
    expect(state.contextSnapshot.selectedNodeIds).toEqual([]);
    expect(state.contextSnapshot.assetRefs).toEqual([]);
    expect(state.contextSnapshot.uploadedAssetIds).toEqual([]);
    expect(state.contextSnapshot.skillRefs).toEqual([]);
    expect(state.contextSnapshot.appRefs).toEqual([]);
  });

  it("bounds prompts, errors, context references, and rejects non-finite cost", () => {
    const long = "x".repeat(10_000);
    let state = initialConversationState({
      contextSnapshot: { projectId: long, flowId: long, selectedNodeIds: [long], assetRefs: [{ assetId: long, refId: long, label: long, nodeId: long }], uploadedAssetIds: [long], skillRefs: [{ id: long, version: 1 }], appRefs: [long], modelKey: long, graphRevision: 1 },
    });
    state = reduceConversation(state, { type: "turn_submitted", prompt: long });
    expect(state.prompt?.length).toBeLessThanOrEqual(4_000);
    state = reduceConversation(state, { type: "turn_failed", error: long });
    expect(state.error?.length).toBeLessThanOrEqual(4_000);
    expect(state.contextSnapshot.projectId?.length).toBeLessThanOrEqual(200);
    expect(state.contextSnapshot.assetRefs[0].nodeId?.length).toBeLessThanOrEqual(200);
    const planned = reduceConversation(initialConversationState(), { type: "brief_ready", plan: { costCredits: Number.NaN }, graphRevision: 0 });
    expect(planned.plan?.costCredits).toBeUndefined();
  });

  it("walks the main conversation loop and allows active failures", () => {
    let state = reduceConversation(initialConversationState(), { type: "turn_submitted", prompt: "做一个方案" });
    state = reduceConversation(state, { type: "choice_requested", id: "direction" });
    state = reduceConversation(state, { type: "choice_submitted", id: "direction", optionIds: ["one"] });
    expect(state.phase).toBe("drafting_brief");
    state = reduceConversation(state, { type: "brief_ready", decisionId: "decision-1", plan: { costCredits: 0 }, graphRevision: 0 });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "decision-1", graphRevision: 0 });
    state = reduceConversation(state, { type: "execution_started" });
    state = reduceConversation(state, { type: "verification_started" });
    state = reduceConversation(state, { type: "results_presented" });
    expect(state.phase).toBe("presenting_results");
    state = reduceConversation(state, { type: "refinement_requested", resultId: "result-1" });
    expect(state.phase).toBe("refining");

    const failed = reduceConversation(
      reduceConversation(initialConversationState(), { type: "turn_submitted", prompt: "失败测试" }),
      { type: "turn_failed", error: "执行失败" },
    );
    expect(failed.phase).toBe("failed");
    expect(failed.error).toBe("执行失败");
  });
});
