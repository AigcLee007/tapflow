import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import { createPgPool, runMigrations, withTenantTransaction } from "@aigc-flow/db";
import { AgentRuntimeRepository } from "../src/modules/agent/runtime/agent-runtime.repository.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";

const migration = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/db/migrations/000084_agent_runtime_rebuild.sql"), "utf8");

describe("canonical Agent persistence boundaries", () => {
  test("rejects unsafe context before obtaining a database connection", async () => {
    const connect = vi.fn(() => { throw new Error("database must not be accessed"); });
    const repository = new AgentRuntimeRepository({ pool: { connect } as never });
    await expect(repository.createTurnIdempotent({ tenantId: randomUUID(), userId: randomUUID() }, {
      sessionId: randomUUID(), prompt: "Make an image", graphRevision: 0, idempotencyKey: "unsafe",
      contextSnapshot: { projectId: null, flowId: null, graphRevision: 0, refs: [], skillIds: [], appIds: [], modelKey: null, secret: "not permitted" } as never,
    })).rejects.toThrow("AGENT_CONTEXT_UNSAFE");
    expect(connect).not.toHaveBeenCalled();
  });

  test("uses the existing mode/phase columns and correctly quoted policy identifiers", () => {
    expect(migration).not.toMatch(/ADD COLUMN IF NOT EXISTS (?:mode|phase) /);
    expect(migration).not.toContain("%I_select_current_tenant");
  });
});

const databaseTest = hasDatabaseEnv() ? test : test.skip;

databaseTest("PostgreSQL: immutable replay, user ownership, graph CAS, atomic snapshots and contiguous events", async () => {
  await withDatabase(async ({ databaseUrl, createAppDatabaseUrl }) => {
    const admin = createPgPool({ connectionString: databaseUrl });
    try {
      await runMigrations(admin);
      const tenantId = randomUUID(), userId = randomUUID(), otherUserId = randomUUID(), projectId = randomUUID(), flowId = randomUUID();
      await admin.query("INSERT INTO users(id,email) VALUES($1,$2),($3,$4)", [userId, `${userId}@example.test`, otherUserId, `${otherUserId}@example.test`]);
      await admin.query("INSERT INTO tenants(id,name,slug) VALUES($1,'Runtime test',$2)", [tenantId, tenantId]);
      await admin.query("INSERT INTO tenant_memberships(tenant_id,user_id,role_key,status) VALUES($1,$2,'tenant_owner','active'),($1,$3,'tenant_member','active')", [tenantId, userId, otherUserId]);
      await admin.query("INSERT INTO projects(id,tenant_id,name,created_by) VALUES($1,$2,'Test',$3)", [projectId, tenantId, userId]);
      await admin.query("INSERT INTO flows(id,tenant_id,project_id,title,created_by) VALUES($1,$2,$3,'Test',$4)", [flowId, tenantId, projectId, userId]);
      await admin.query("INSERT INTO flow_drafts(tenant_id,project_id,flow_id,revision) VALUES($1,$2,$3,7)", [tenantId, projectId, flowId]);
      const pool = createPgPool({ connectionString: await createAppDatabaseUrl() });
      try {
        const ctx = { tenantId, userId }, other = { tenantId, userId: otherUserId };
        const repository = new AgentRuntimeRepository({ pool });
        const session = await repository.createSession(ctx, { projectId, flowId });
        await expect(repository.getSession(other, session.id)).rejects.toThrow("AGENT_SESSION_NOT_FOUND");
        await expect(repository.createSession(other, { projectId, flowId })).rejects.toThrow("AGENT_PROJECT_NOT_FOUND");
        await expect(repository.createSession(ctx, { projectId: null, flowId })).rejects.toThrow("AGENT_SESSION_SCOPE_INVALID");
        const input = { sessionId: session.id, prompt: "Make three images", graphRevision: 7, idempotencyKey: randomUUID(), contextSnapshot: { projectId, flowId, graphRevision: 7, refs: [], skillIds: [], appIds: [], modelKey: null } };
        const first = await repository.createTurnIdempotent(ctx, input);
        expect(first.contextSnapshot).toEqual(input.contextSnapshot);
        await expect(repository.createTurnIdempotent(ctx, { ...input, prompt: "Different request" })).rejects.toThrow("AGENT_TURN_IDEMPOTENCY_CONFLICT");
        const state = { sessionId: session.id, turnId: first.id, expectedStateVersion: first.stateVersion, expectedGraphRevision: 7, graphRevision: 7, phase: "planning", executionState: "idle", blocks: [{ type: "understanding" as const, id: "understanding", text: "Three images" }], planJson: { quantity: 3 } };
        const results = await Promise.allSettled([repository.saveTurnStateCAS(ctx, state), repository.saveTurnStateCAS(ctx, state)]);
        expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
        expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
        const reloaded = new AgentRuntimeRepository({ pool });
        const saved = await reloaded.getTurn(ctx, session.id, first.id);
        expect(saved.stateVersion).toBe(first.stateVersion + 1);
        expect(saved.contextSnapshot).toEqual(input.contextSnapshot);
        expect(saved.planJson).toEqual({ quantity: 3 });
        await admin.query("CREATE FUNCTION reject_runtime_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_SNAPSHOT_FAILURE'; END $$");
        await admin.query("CREATE TRIGGER reject_runtime_snapshot BEFORE INSERT ON agent_events FOR EACH ROW EXECUTE FUNCTION reject_runtime_snapshot()");
        await expect(repository.saveTurnStateCAS(ctx, { ...state, expectedStateVersion: saved.stateVersion })).rejects.toThrow("TEST_SNAPSHOT_FAILURE");
        expect((await repository.getTurn(ctx, session.id, first.id)).stateVersion).toBe(saved.stateVersion);
        await admin.query("DROP TRIGGER reject_runtime_snapshot ON agent_events");
        const events = await reloaded.listEvents(ctx, session.id);
        expect(events.at(-1)?.event).toMatchObject({ turn: { stateVersion: saved.stateVersion, blocks: saved.blocks } });
        await Promise.all(Array.from({ length: 12 }, (_, i) => repository.appendEvent(ctx, { sessionId: session.id, turnId: first.id, eventType: "progress", event: { index: i }, idempotencyKey: `event-${i}` })));
        await repository.appendEvent(ctx, { sessionId: session.id, turnId: first.id, eventType: "progress", event: { index: 0 }, idempotencyKey: "event-0" });
        const allEvents = await reloaded.listEvents(ctx, session.id);
        expect(allEvents.map(event => event.seq)).toEqual(Array.from({ length: allEvents.length }, (_, i) => i + 1));
        expect(allEvents).toHaveLength(events.length + 12);
        const history = await repository.getHistory(ctx, session.id, { limit: 1 });
        expect(history.turns[0].id).toBe(first.id);
        expect(history.lastSeq).toBe(allEvents.at(-1)?.seq);
        const pendingId = randomUUID();
        const pending = await repository.saveTurnStateCAS(ctx, { ...state, expectedStateVersion: saved.stateVersion, phase: "waiting_for_confirmation", blocks: [{ type: "confirmation", id: "confirm", text: "Generate three images?" }], pendingDecision: { id: pendingId, blockId: "confirm", graphRevision: 7, allowedTypes: ["approve_plan", "revise_plan"] } });
        const decisionInput = { sessionId: session.id, turnId: first.id, decisionId: pendingId, blockId: "confirm", graphRevision: 7, idempotencyKey: randomUUID(), type: "approve_plan", payload: {} };
        const submitted = await Promise.all([repository.beginDecision(ctx, decisionInput), reloaded.beginDecision(ctx, decisionInput)]);
        expect(submitted.filter(result => !result.replay)).toHaveLength(1);
        expect(submitted.filter(result => result.replay)).toHaveLength(1);
        await expect(repository.beginDecision(ctx, { ...decisionInput, payload: { changed: true } })).rejects.toThrow("AGENT_DECISION_IDEMPOTENCY_CONFLICT");
        await expect(repository.beginDecision(ctx, { ...decisionInput, idempotencyKey: randomUUID() })).rejects.toThrow("AGENT_DECISION_ALREADY_SUBMITTED");
        const accepted = submitted.find(result => !result.replay)!;
        expect(accepted.turn.pendingDecision).toBeNull();
        expect(accepted.turn.stateVersion).toBe(pending.stateVersion + 1);
        const completed = await repository.completeDecision(ctx, { ...state, decisionId: accepted.decision.id, expectedStateVersion: accepted.turn.stateVersion, phase: "executing", executionState: "queued", status: "running" });
        expect(completed.stateVersion).toBe(accepted.turn.stateVersion + 1);
        const replay = await reloaded.beginDecision(ctx, decisionInput);
        expect(replay.replay).toBe(true);
        expect(replay.decision.resultSnapshot).toMatchObject({ stateVersion: completed.stateVersion });
        const claims = await Promise.all([repository.claimExecution(ctx, { sessionId: session.id, turnId: first.id, owner: "worker-a" }), reloaded.claimExecution(ctx, { sessionId: session.id, turnId: first.id, owner: "worker-b" })]);
        expect(claims.filter(Boolean)).toHaveLength(1);
        await repository.releaseExecution(ctx, { sessionId: session.id, turnId: first.id, owner: claims[0] ? "worker-a" : "worker-b" });
        expect(await reloaded.claimExecution(ctx, { sessionId: session.id, turnId: first.id, owner: "worker-c" })).toBe(true);
        const group = await repository.saveResultGroup(ctx, { sessionId: session.id, turnId: first.id });
        expect(await reloaded.saveResultGroup(ctx, { sessionId: session.id, turnId: first.id })).toBe(group);
        const assetId = randomUUID(), otherAssetId = randomUUID();
        await admin.query("INSERT INTO assets(id,tenant_id,project_id,owner_user_id,kind,mime_type,bucket,object_key,status) VALUES($1,$2,$3,$4,'image','image/png','tests',$1::uuid::text,'available'),($5,$2,$3,$6,'image','image/png','tests',$5::uuid::text,'available')", [assetId, tenantId, projectId, userId, otherAssetId, otherUserId]);
        const media = await repository.saveResultRef(ctx, { resultGroupId: group, assetId, kind: "image", label: "Image" });
        expect(media.assetId).toBe(assetId);
        expect((await reloaded.saveResultRef(ctx, { resultGroupId: group, assetId, kind: "image", label: "Image" })).id).toBe(media.id);
        await expect(repository.saveResultRef(ctx, { resultGroupId: group, assetId: otherAssetId, kind: "image", label: "Private" })).rejects.toThrow("AGENT_ASSET_NOT_FOUND");
        const textResult = await repository.saveResultRef(ctx, { resultGroupId: group, kind: "text", label: "Caption", contentText: "A quiet forest", idempotencyKey: "caption" });
        expect((await reloaded.saveResultRef(ctx, { resultGroupId: group, kind: "text", label: "Caption", contentText: "A quiet forest", idempotencyKey: "caption" })).id).toBe(textResult.id);
        await expect(repository.saveResultRef(other, { resultGroupId: group, kind: "text", label: "Other", contentText: "Other" })).rejects.toThrow("AGENT_SESSION_NOT_FOUND");
        const graph = { nodes: [{ id: "caption-node", type: "text", position: { x: 0, y: 0 }, data: { content: "A quiet forest" } }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
        const placed = await repository.placeResultAtomic(ctx, { resultId: textResult.id, placedNodeId: "caption-node", expectedGraphRevision: 7, graph });
        expect(placed.graphRevision).toBe(8);
        expect(placed.result.placedNodeId).toBe("caption-node");
        expect((await reloaded.placeResultAtomic(ctx, { resultId: textResult.id, placedNodeId: "caption-node", expectedGraphRevision: 7, graph })).result.id).toBe(textResult.id);
        expect(Number((await admin.query("SELECT revision FROM flow_drafts WHERE flow_id=$1", [flowId])).rows[0].revision)).toBe(8);
        await admin.query("UPDATE flow_drafts SET revision=8 WHERE flow_id=$1", [flowId]);
        await expect(repository.saveTurnStateCAS(ctx, { ...state, expectedStateVersion: completed.stateVersion })).rejects.toThrow("AGENT_GRAPH_REVISION_CONFLICT");
        expect((await repository.getTurn(ctx, session.id, first.id)).stateVersion).toBe(completed.stateVersion);
        expect((await repository.createTurnIdempotent(ctx, input)).id).toBe(first.id);
        await expect(repository.createTurnIdempotent(ctx, { ...input, idempotencyKey: randomUUID() })).rejects.toThrow("AGENT_GRAPH_REVISION_CONFLICT");
        const second = await repository.createTurnIdempotent(ctx, { ...input, idempotencyKey: randomUUID(), graphRevision: 8, contextSnapshot: { ...input.contextSnapshot, graphRevision: 8 } });
        await admin.query("UPDATE agent_turns SET created_at='2026-09-21 14:00:00.123456+00' WHERE id=ANY($1::uuid[])", [[first.id, second.id]]);
        const pageOne = await repository.getHistory(ctx, session.id, { limit: 1 });
        const pageTwo = await repository.getHistory(ctx, session.id, { limit: 1, cursor: pageOne.nextCursor });
        expect(new Set([...pageOne.turns, ...pageTwo.turns].map(turn => turn.id)).size).toBe(2);
        const outsiderTenant = randomUUID();
        await admin.query("INSERT INTO tenants(id,name,slug) VALUES($1,'Other',$2)", [outsiderTenant, outsiderTenant]);
        const hidden = await withTenantTransaction({ tenantId: outsiderTenant, userId: otherUserId }, client => client.query("SELECT id FROM agent_events WHERE session_id=$1", [session.id]), pool);
        expect(hidden.rowCount).toBe(0);
        await expect(admin.query("INSERT INTO agent_events(tenant_id,session_id,turn_id,seq,event_type) VALUES($1,$2,$3,1000,'bad')", [outsiderTenant, session.id, first.id])).rejects.toMatchObject({ code: "23503" });
      } finally { await pool.end(); }
    } finally { await admin.end(); }
  });
}, 120_000);

