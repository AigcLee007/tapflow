import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canExecuteDecision,
  initialConversationState,
  reduceConversation,
} from "./conversationReducer";

describe("Agent V6 conversation reducer", () => {
  afterEach(() => vi.restoreAllMocks());

  const applyBrief = (state: ReturnType<typeof initialConversationState>, event: Extract<Parameters<typeof reduceConversation>[1], { type: "brief_ready" }>) => {
    let next = state;
    if (next.phase === "idle") next = reduceConversation(next, { type: "turn_submitted", prompt: "test" });
    if (next.phase === "understanding") next = reduceConversation(next, { type: "brief_started" });
    return reduceConversation(next, event);
  };

  it("keeps an ambiguous prompt in choice state", () => {
    const state = reduceConversation(initialConversationState(), {
      type: "turn_submitted",
      prompt: "设计一个儿童陪伴玩具",
    });
    expect(state.phase).toBe("understanding");

    const next = reduceConversation(state, { type: "choice_requested", id: "direction" });
    expect(next.phase).toBe("waiting_for_choice");
  });

  it("does not accept brief_ready directly from understanding", () => {
    const state = reduceConversation(initialConversationState(), {
      type: "turn_submitted",
      prompt: "直接准备 brief",
    });

    const next = reduceConversation(state, { type: "brief_ready", graphRevision: 0 });

    expect(next).toBe(state);
    expect(next.phase).toBe("understanding");
    expect(reduceConversation(next, { type: "brief_started" }).phase).toBe("drafting_brief");
  });

  it("requires confirmation for paid canvas writes", () => {
    const state = applyBrief(initialConversationState(), {
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

  it("generates distinct injected IDs for missing session and turn IDs", () => {
    const ids = ["generated-session", "generated-turn", "generated-decision", "generated-idempotency"];
    const createId = vi.fn(() => ids.shift() ?? "fallback-id");
    let state = initialConversationState({}, { createId });
    expect(state.sessionId).toBe("generated-session");
    expect(state.turnId).toBe("generated-turn");

    state = reduceConversation(state, { type: "turn_submitted", prompt: "test" });
    state = reduceConversation(state, { type: "brief_started" });
    state = reduceConversation(state, { type: "brief_ready", graphRevision: 0 }, { createId });
    expect(state.pendingDecision?.sessionId).toBe("generated-session");
    expect(state.pendingDecision?.turnId).toBe("generated-turn");
    expect(state.pendingDecision?.decisionId).toBe("generated-decision");
    expect(state.pendingDecision?.idempotencyKey).toBe("generated-idempotency");
    expect(state.pendingDecision?.decisionId).not.toBe(state.pendingDecision?.idempotencyKey);
    expect(state.pendingDecision!.decisionId.length).toBeLessThanOrEqual(128);
    expect(state.pendingDecision!.idempotencyKey.length).toBeLessThanOrEqual(128);

    state = reduceConversation(state, {
      type: "confirmation_granted",
      decisionId: state.pendingDecision!.decisionId,
      graphRevision: 0,
    });

    expect(state.phase).toBe("executing");
    expect(canExecuteDecision(state, state.pendingDecision!)).toBe(true);
  });

  it("generates unique IDs for missing and invalid session and turn IDs", () => {
    const createId = vi.fn()
      .mockReturnValueOnce("session-generated-1")
      .mockReturnValueOnce("turn-generated-1")
      .mockReturnValueOnce("session-generated-2")
      .mockReturnValueOnce("turn-generated-2")
      .mockReturnValueOnce("session-generated-3")
      .mockReturnValueOnce("turn-generated-3");
    for (const overrides of [
      {},
      { sessionId: "https://signed.example/session", turnId: "eyJhbGciOiJIUzI1NiJ9.payload.signature" },
      { sessionId: undefined, turnId: null },
    ]) {
      const state = initialConversationState(overrides as never, { createId });
      expect(state.sessionId).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(state.turnId).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(state.sessionId).not.toBe("session");
      expect(state.turnId).not.toBe("turn");
    }
  });

  it("accepts a legal maximum-length identity through confirmation", () => {
    const sessionId = "s".repeat(128);
    const turnId = "t".repeat(128);
    let state = initialConversationState({ sessionId, turnId });
    state = applyBrief(state, { type: "brief_ready", graphRevision: 0 });
    expect(state.pendingDecision?.sessionId).toBe(sessionId);
    expect(state.pendingDecision?.turnId).toBe(turnId);
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: state.pendingDecision!.decisionId, graphRevision: 0 });
    expect(state.phase).toBe("executing");
    expect(canExecuteDecision(state, state.pendingDecision!)).toBe(true);
  });

  it("tracks execution state and requires matching confirmation metadata", () => {
    let state = initialConversationState({ sessionId: "session-1", turnId: "turn-1", graphRevision: 4 });
    state = applyBrief(state, { type: "brief_ready", decisionId: "decision-1", plan: { costCredits: 12 }, graphRevision: 4 });
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
    state = applyBrief(state, { type: "brief_ready", decisionId: "decision-1", plan: { costCredits: 0 }, graphRevision: 1 });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "decision-1", graphRevision: 1 });
    const decision = { type: "execute" as const, decisionId: "decision-1", sessionId: "session-1", turnId: "turn-1", graphRevision: 1, payload: {}, idempotencyKey: state.pendingDecision!.idempotencyKey, costCredits: 0 };
    expect(canExecuteDecision(state, decision)).toBe(true);
    state = reduceConversation(state, { type: "verification_started" });
    expect(state.phase).toBe("verifying");
    expect(canExecuteDecision(state, decision)).toBe(false);
  });

  it("rejects execution decisions whose metadata or risk differs from the confirmed plan", () => {
    let state = initialConversationState({ sessionId: "session-1", turnId: "turn-1", graphRevision: 2 });
    state = applyBrief(state, { type: "brief_ready", decisionId: "decision-1", plan: { costCredits: 12, writesCanvas: true }, graphRevision: 2 });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "decision-1", graphRevision: 2 });
    const base = { type: "execute" as const, decisionId: "decision-1", sessionId: "session-1", turnId: "turn-1", graphRevision: 2, payload: {}, idempotencyKey: state.pendingDecision!.idempotencyKey, costCredits: 12, writesCanvas: true };
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
    state = applyBrief(state, { type: "brief_ready", decisionId: "d", graphRevision: 0, payload: { prompt: "approved", fields: { tone: "calm" } } });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "d", graphRevision: 0 });
    const base = { type: "execute" as const, decisionId: "d", sessionId: "s", turnId: "t", graphRevision: 0, idempotencyKey: state.pendingDecision!.idempotencyKey, costCredits: 0 };
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", fields: { tone: "calm" } } })).toBe(true);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "replaced", fields: { tone: "calm" } } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", fields: { tone: "calm", route: "internal" } } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", asset: "data:image/png;base64,secret" } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", credential: "secret" } })).toBe(false);
  });

  it("rejects sensitive keys nested inside parameters and keeps safe fields comparable", () => {
    let state = initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 0 });
    state = applyBrief(state, {
      type: "brief_ready",
      decisionId: "d",
      graphRevision: 0,
      payload: { prompt: "approved", parameters: { apiKey: "secret", signed_url: "temporary", baseUrl: "internal", safe: "ok" } },
    });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "d", graphRevision: 0 });
    const base = { type: "execute" as const, decisionId: "d", sessionId: "s", turnId: "t", graphRevision: 0, idempotencyKey: state.pendingDecision!.idempotencyKey, costCredits: 0 };
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", parameters: { safe: "ok" } } })).toBe(true);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", parameters: { safe: "ok", api_key: "secret" } } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", parameters: { safe: "ok", "signed-url": "temporary" } } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "approved", parameters: { safe: "ok", "base-url": "internal" } } })).toBe(false);
  });

  it("validates nested reference payloads as stable IDs, including every array item", () => {
    const safePayload = {
      parameters: {
        nested: {
          assetId: "asset-1",
          nodeId: "node-1",
          refId: "ref-1",
          referenceIds: ["ref-1", "ref-2"],
          uploadedAssetIds: ["asset-2", "asset-3"],
        },
      },
    };
    const safe = applyBrief(initialConversationState({ sessionId: "s", turnId: "t" }), {
      type: "brief_ready",
      decisionId: "d",
      graphRevision: 0,
      payload: safePayload,
    });
    expect(safe.pendingDecision?.payload).toEqual(safePayload);

    for (const [key, value] of [
      ["assetId", "https://signed.example/asset?token=secret"],
      ["nodeId", "data:image/png;base64,secret"],
      ["refId", "blob:https://local/ref"],
      ["referenceIds", ["ref-1", "https://signed.example/ref"]],
      ["uploadedAssetIds", ["asset-1", "Bearer secret-token"]],
    ] as const) {
      const rejected = applyBrief(initialConversationState({ sessionId: "s", turnId: "t" }), {
        type: "brief_ready",
        decisionId: "d",
        graphRevision: 0,
        payload: { parameters: { nested: { [key]: value } } },
      });
      expect(rejected.pendingDecision, key).toBeNull();
      expect(rejected.phase, key).toBe("drafting_brief");
    }
  });

  const expectSensitiveKeysToBeRemoved = (sensitiveKeyVariants: string[]) => {
    for (const key of sensitiveKeyVariants) {
      const state = applyBrief(initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 0 }), {
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
    state = applyBrief(state, { type: "brief_ready", decisionId: "d", graphRevision: 0, payload: {} });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "d", graphRevision: 0 });
    const base = { type: "execute" as const, decisionId: "d", sessionId: "s", turnId: "t", graphRevision: 0, idempotencyKey: "d", costCredits: 0 };
    expect(canExecuteDecision(state, { ...base, payload: { value: "Bearer abc.def.ghi" } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { value: "A".repeat(80) + "=" } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { value: "Authorization: Bearer secret-token" } })).toBe(false);
  });

  it("returns failed conversations to explicit retry, revise, and recover phases", () => {
    let state = initialConversationState({ sessionId: "session-1", turnId: "turn-1", graphRevision: 0 });
    state = applyBrief(state, { type: "brief_ready", plan: { costCredits: 0 }, graphRevision: 0 });
    const decisionId = state.pendingDecision!.decisionId;
    expect(decisionId.length).toBeLessThanOrEqual(128);
    state = reduceConversation(state, { type: "confirmation_granted", decisionId, graphRevision: 0 });
    const failed = reduceConversation(state, { type: "turn_failed", error: "错误" });
    const retried = reduceConversation(failed, { type: "retry" });
    expect(retried.phase).toBe("executing");
    expect(retried.pendingDecision?.decisionId).toBe(decisionId);
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
    state = applyBrief(state, { type: "brief_ready", plan: {}, graphRevision: 7 });
    expect(state.graphRevision).toBe(7);
    expect(state.contextSnapshot.graphRevision).toBe(7);
    expect(state.pendingDecision?.graphRevision).toBe(7);
    expect(reduceConversation(state, { type: "brief_ready", graphRevision: Number.NaN }).phase).toBe("waiting_for_confirmation");
    expect(reduceConversation(state, { type: "brief_ready", graphRevision: Number.POSITIVE_INFINITY }).graphRevision).toBe(7);
    expect(reduceConversation(state, { type: "brief_ready", graphRevision: -1 }).graphRevision).toBe(7);
  });

  it("rejects a stale brief without changing state or creating a pending decision", () => {
    const state = initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 5 });
    const readyState = reduceConversation(state, { type: "turn_submitted", prompt: "brief" });
    const next = reduceConversation(readyState, { type: "brief_ready", decisionId: "stale", graphRevision: 4 });
    expect(next).toBe(readyState);
    expect(next.graphRevision).toBe(5);
    expect(next.pendingDecision).toBeNull();
  });

  it("rejects events that do not belong to the idle state", () => {
    const state = initialConversationState({ graphRevision: 3 });
    for (const event of [
      { type: "brief_ready" as const, graphRevision: 3 },
      { type: "execution_started" as const },
      { type: "confirmation_granted" as const, decisionId: "d", graphRevision: 3 },
    ]) {
      expect(reduceConversation(state, event)).toBe(state);
    }
  });

  it("uses the event revision when a refinement produces a new brief", () => {
    let state = initialConversationState({ sessionId: "session-1", turnId: "turn-1", graphRevision: 2 });
    state = applyBrief(state, { type: "brief_ready", decisionId: "old", plan: {}, graphRevision: 2 });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "old", graphRevision: 2 });
    state = reduceConversation(state, { type: "verification_started" });
    state = reduceConversation(state, { type: "results_presented" });
    state = reduceConversation(state, { type: "refinement_requested", resultId: "result-1" });
    state = reduceConversation(state, { type: "turn_submitted", prompt: "refine" });
    state = reduceConversation(state, { type: "brief_started" });
    state = applyBrief(state, { type: "brief_ready", decisionId: "new", plan: { writesCanvas: true }, graphRevision: 9 });
    expect(state.phase).toBe("waiting_for_confirmation");
    expect(state.graphRevision).toBe(9);
    expect(state.contextSnapshot.graphRevision).toBe(9);
    expect(state.pendingDecision?.decisionId).toBe("new");
    expect(state.pendingDecision?.graphRevision).toBe(9);
  });

  it("keeps confirmed high-risk plan metadata through recovery", () => {
    let state = initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 1 });
    state = applyBrief(state, { type: "brief_ready", decisionId: "d", plan: { costCredits: 4, batch: true, writesCanvas: true, skill: true, app: true, title: "Plan" }, graphRevision: 1 });
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
    state = applyBrief(state, { type: "brief_ready", decisionId: "d", plan: { costCredits: 4, writesCanvas: true }, graphRevision: 1 });
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
    state = applyBrief(state, { type: "brief_ready", decisionId: "d", plan: {}, graphRevision: 1 });
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
    state = applyBrief(state, { type: "brief_ready", decisionId: "d", plan: {}, graphRevision: 0 });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "d", graphRevision: 0 });
    const base = { type: "execute" as const, decisionId: "d", sessionId: "s", turnId: "t", graphRevision: 0, idempotencyKey: state.pendingDecision!.idempotencyKey, costCredits: 0 };
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
    state = applyBrief(state, { type: "brief_ready", decisionId: "d", plan: {}, graphRevision: 0 });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "d", graphRevision: 0 });
    const base = { type: "execute" as const, decisionId: "d", sessionId: "s", turnId: "t", graphRevision: 0, idempotencyKey: state.pendingDecision!.idempotencyKey, costCredits: 0 };

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
    const state = applyBrief(initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 0 }), {
      type: "brief_ready",
      decisionId: "d",
      graphRevision: 0,
      payload: { value: Array.from({ length: 33 }, () => "x") },
    });
    expect(state.phase).toBe("drafting_brief");
    expect(state.pendingDecision).toBeNull();
  });

  it("preserves graph revision when resetting", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("550e8400-e29b-41d4-a716-446655440000");
    const state = initialConversationState({ sessionId: "session-1", turnId: "turn-1", graphRevision: 12 });
    const reset = reduceConversation(state, { type: "reset" });
    expect(reset.phase).toBe("idle");
    expect(reset.graphRevision).toBe(12);
    expect(reset.contextSnapshot.graphRevision).toBe(12);
    expect(reset.sessionId).toBe("session-1");
    expect(reset.turnId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(reset.turnId).not.toBe(state.turnId);
    expect(reset.turnId).toMatch(/^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/);
  });

  it("keeps reset decision identity bound to the preserved session and new turn", () => {
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440001")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440002");
    const first = initialConversationState({ sessionId: "session-1", turnId: "turn-1" });
    const firstReset = reduceConversation(first, { type: "reset" });
    const secondReset = reduceConversation(first, { type: "reset" });
    const firstDecision = applyBrief(firstReset, { type: "brief_ready", graphRevision: 0 }).pendingDecision!;
    const secondDecision = applyBrief(secondReset, { type: "brief_ready", graphRevision: 0 }).pendingDecision!;

    expect(firstReset.sessionId).toBe(secondReset.sessionId);
    expect(firstReset.turnId).not.toBe(secondReset.turnId);
    expect(firstDecision.sessionId).toBe("session-1");
    expect(secondDecision.sessionId).toBe("session-1");
    expect(firstDecision.turnId).toBe(firstReset.turnId);
    expect(secondDecision.turnId).toBe(secondReset.turnId);
    expect(firstDecision.decisionId).not.toBe(secondDecision.decisionId);
  });

  it("generates the same required decision ID when brief_ready omits one", () => {
    const first = applyBrief(initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 3 }), { type: "brief_ready", graphRevision: 3 });
    const second = applyBrief(initialConversationState({ sessionId: "s", turnId: "t", graphRevision: 3 }), { type: "brief_ready", graphRevision: 3 });
    expect(first.pendingDecision?.decisionId).toHaveLength(36);
    expect(second.pendingDecision?.decisionId).not.toBe(first.pendingDecision?.decisionId);
    expect(first.pendingDecision?.idempotencyKey).not.toBe(first.pendingDecision?.decisionId);
    expect(first.pendingDecision?.sessionId).toBe("s");
    expect(first.pendingDecision?.turnId).toBe("t");
  });

  it("normalizes invalid initial graph revisions", () => {
    expect(initialConversationState({ graphRevision: -1 }).graphRevision).toBe(0);
    expect(initialConversationState({ graphRevision: Number.NaN }).contextSnapshot.graphRevision).toBe(0);
    expect(initialConversationState({ graphRevision: Number.POSITIVE_INFINITY }).graphRevision).toBe(0);
  });

  it("normalizes every initial state field instead of allowing overrides to bypass invariants", () => {
    const state = initialConversationState({
      phase: "waiting_for_confirmation" as never,
      executionState: "completed" as never,
      mode: "invalid" as never,
      prompt: 42 as never,
      pendingQuestionId: "bad id" as never,
      pendingDecision: {
        type: "execute",
        decisionId: "https://signed.example/decision",
        sessionId: "session-1",
        turnId: "turn-1",
        graphRevision: 4,
        payload: {},
        idempotencyKey: "https://signed.example/decision",
      } as never,
      plan: { title: "x", costCredits: Number.POSITIVE_INFINITY },
      blocks: [{ type: "heading", level: 2, text: "safe", html: "<script>" }] as never,
      progress: [{ id: "https://signed.example/step", label: "bad", status: "running" }] as never,
      results: [{ id: "https://signed.example/result", label: "bad" }] as never,
      refiningResultId: "blob:https://local/result" as never,
      error: 42 as never,
      sessionId: "session-1",
      turnId: "turn-1",
      graphRevision: 4,
      contextSnapshot: {
        projectId: "project-1",
        flowId: "flow-1",
        selectedNodeIds: ["node-1"],
        assetRefs: [],
        uploadedAssetIds: ["asset-1"],
        skillRefs: [],
        appRefs: [],
        modelKey: "model-1",
        graphRevision: 4,
      },
    });

    expect(state.phase).toBe("idle");
    expect(state.executionState).toBe("idle");
    expect(state.mode).toBe("manual_confirmation");
    expect(state.prompt).toBeNull();
    expect(state.pendingQuestionId).toBeNull();
    expect(state.pendingDecision).toBeNull();
    expect(state.plan).toEqual({ title: "x" });
    expect(state.blocks).toEqual([{ type: "heading", level: 2, text: "safe" }]);
    expect(state.progress).toEqual([]);
    expect(state.results).toEqual([]);
    expect(state.refiningResultId).toBeNull();
    expect(state.error).toBeNull();
    expect(state.contextSnapshot.projectId).toBe("project-1");
    expect(state.graphRevision).toBe(4);
  });

  it("uses the same stable ID validation for decisions and context IDs", () => {
    const state = initialConversationState({ sessionId: "https://signed.example/session", turnId: "turn-1" });
    const started = reduceConversation(state, { type: "turn_submitted", prompt: "test" });
    const ready = reduceConversation(reduceConversation(started, { type: "brief_started" }), {
      type: "brief_ready",
      decisionId: "https://signed.example/decision",
      graphRevision: 0,
    });

    expect(ready.pendingDecision).toBeNull();
    expect(ready.phase).toBe("drafting_brief");
  });

  it("validates and caps stable IDs at event boundaries", () => {
    const understanding = reduceConversation(
      reduceConversation(initialConversationState(), { type: "turn_submitted", prompt: "test" }),
      { type: "choice_requested", id: "invalid question id" },
    );
    expect(understanding.phase).toBe("understanding");

    const waiting = reduceConversation(understanding, { type: "choice_requested", id: "direction" });
    const optionIds = Array.from({ length: 100 }, (_, index) => `option-${index}`);
    const drafted = reduceConversation(waiting, { type: "choice_submitted", id: "direction", optionIds });
    expect(drafted.phase).toBe("drafting_brief");

    const presented = { ...drafted, phase: "presenting_results" as const };
    expect(reduceConversation(presented, { type: "refinement_requested", resultId: "blob:https://local/result" })).toBe(presented);
  });

  it("requires the current question ID for choice submissions and ignores replay or out-of-order events", () => {
    let state = reduceConversation(initialConversationState(), { type: "turn_submitted", prompt: "test" });
    state = reduceConversation(state, { type: "choice_requested", id: "first-question" });
    expect(reduceConversation(state, { type: "choice_submitted", optionIds: ["one"] } as never)).toBe(state);
    expect(reduceConversation(state, { type: "choice_submitted", id: "old-question", optionIds: ["one"] })).toBe(state);

    state = reduceConversation(
      reduceConversation(initialConversationState(), { type: "turn_submitted", prompt: "new question" }),
      { type: "choice_requested", id: "second-question" },
    );
    expect(reduceConversation(state, { type: "choice_submitted", id: "first-question", optionIds: ["one"] })).toBe(state);
    const submitted = reduceConversation(state, { type: "choice_submitted", id: "second-question", optionIds: ["one"] });
    expect(submitted.phase).toBe("drafting_brief");
    expect(reduceConversation(submitted, { type: "choice_submitted", id: "second-question", optionIds: ["one"] })).toBe(submitted);
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

  it("drops transient and token-like context identifiers", () => {
    const state = initialConversationState({
      contextSnapshot: {
        projectId: "https://signed.example/project?token=secret",
        flowId: "flow-1",
        selectedNodeIds: ["node-1", "blob:https://local/node"],
        assetRefs: [{ assetId: "data:image/png;base64,abc", refId: "ref-1", label: "bad", nodeId: "node-1" }, { assetId: "asset-1", refId: "https://signed.example/ref", label: "bad", nodeId: "node-2" }],
        uploadedAssetIds: ["asset-2", "https://signed.example/upload?token=secret"],
        skillRefs: [],
        appRefs: [],
        modelKey: null,
        graphRevision: 0,
      },
    });
    expect(state.contextSnapshot.projectId).toBeNull();
    expect(state.contextSnapshot.selectedNodeIds).toEqual(["node-1"]);
    expect(state.contextSnapshot.assetRefs).toEqual([]);
    expect(state.contextSnapshot.uploadedAssetIds).toEqual(["asset-2"]);
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
    expect(state.contextSnapshot.projectId).toBeNull();
    expect(state.contextSnapshot.assetRefs).toEqual([]);
    const planned = applyBrief(initialConversationState(), { type: "brief_ready", plan: { costCredits: Number.NaN }, graphRevision: 0 });
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
