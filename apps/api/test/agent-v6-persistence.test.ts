import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";

import { createPgPool, runMigrations, withTenantTransaction } from "@aigc-flow/db";
import { AgentSessionRepository } from "../src/modules/agent/agent-session.repository.js";
import { hasDatabaseEnv, withAppContextTransaction, withDatabase } from "../../../packages/db/test/helpers.js";

const rootMigrationPath = path.resolve(process.cwd(), "packages/db/migrations/000080_agent_v6_conversation.sql");
const migrationPath = existsSync(rootMigrationPath)
  ? rootMigrationPath
  : path.resolve(process.cwd(), "../../packages/db/migrations/000080_agent_v6_conversation.sql");
const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

afterAll(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("Agent V6 persistence contract", () => {
  test("defines an idempotent tenant-safe migration for V6 fields", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS progress_json");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS capability_refs_json");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS result_refs_json");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS idempotency_key");
    expect(sql).toContain("tenant_id, idempotency_key");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  });

  test("exposes V6 snapshot and decision repository methods", () => {
    expect(typeof AgentSessionRepository.prototype.saveV6TurnSnapshot).toBe("function");
    expect(typeof AgentSessionRepository.prototype.recordV6Decision).toBe("function");
  });

  test("redacts unsafe recursive JSON before binding snapshot and decision query parameters", async () => {
    const queryParameters: unknown[][] = [];
    const client = {
      query: async (sql: string, parameters?: unknown[]) => {
        if (parameters) queryParameters.push(parameters);
        if (sql.includes("FROM agent_sessions")) return { rowCount: 1, rows: [{ id: "session-1", tenant_id: "tenant-1", project_id: null, flow_id: null, title: "V6", status: "active", execution_mode: "manual_confirmation", conversation_phase: "idle" }] };
        if (sql.includes("UPDATE agent_turns")) return { rowCount: 1, rows: [{ id: "turn-1", blocks_json: {}, context_snapshot_json: {}, progress_json: [], capability_refs_json: [], result_refs_json: [], conversation_phase: "executing", execution_state: "running", graph_revision: "7", requires_confirmation: true }] };
        if (sql.includes("INSERT INTO agent_v5_decisions")) return { rowCount: 1, rows: [{ id: "decision-1", created_at: "2026-09-09T00:00:00.000Z" }] };
        return { rowCount: 0, rows: [] };
      },
      release: () => undefined,
    };
    const repository = new AgentSessionRepository({ pool: { connect: async () => client } as never });
    const unsafe = {
      safe: "kept",
      provider: "secret-provider",
      nested: {
        route: "internal-route",
        credential: "encrypted-secret",
        apiKey: "secret-key",
        baseUrl: "https://provider.example",
        signedUrl: "https://signed.example/file?token=secret",
        authorization: "Bearer secret-token",
        token: "secret-token",
        secret: "secret",
        password: "password",
        nonce: "nonce",
        authTag: "auth-tag",
        html: "<script>",
        base64: "data:image/png;base64,AAAA",
        blob: "blob:https://local/file",
        data: "data:text/plain,secret",
        previewUrl: "https://signed.example/preview?token=secret",
      },
      list: Array.from({ length: 100 }, (_, index) => ({ index, value: "x" })),
      text: "x".repeat(10_000),
    };

    await repository.saveV6TurnSnapshot({ tenantId: "tenant-1", userId: "user-1" }, {
      sessionId: "session-1",
      turnId: "turn-1",
      blocksJson: unsafe,
      contextSnapshotJson: unsafe,
      progressJson: unsafe,
      capabilityRefsJson: unsafe,
      resultRefsJson: unsafe,
      graphRevision: 7,
      conversationPhase: "executing",
      executionState: "running",
      requiresConfirmation: true,
    });
    await repository.recordV6Decision({ tenantId: "tenant-1", userId: "user-1" }, {
      sessionId: "session-1",
      turnId: "turn-1",
      idempotencyKey: "decision-1",
      decisionJson: unsafe,
      fromPhase: "waiting_for_confirmation",
      toPhase: "executing",
    });

    const serializedWrites = JSON.stringify(queryParameters);
    expect(serializedWrites).toContain("kept");
    expect(serializedWrites).not.toMatch(/secret-provider|internal-route|encrypted-secret|secret-key|signed\.example|Bearer secret|<script>|data:image|blob:|password|auth-tag/i);
    const persistedBlocksJson = queryParameters.flat().find((value) => typeof value === "string" && value.includes('"safe":"kept"'));
    expect(persistedBlocksJson).toBeTypeOf("string");
    const persistedBlocks = JSON.parse(String(persistedBlocksJson));
    expect(persistedBlocks.text.length).toBeLessThanOrEqual(4000);
    expect((persistedBlocks.list as unknown[]).length).toBeLessThanOrEqual(32);
  });
});

describeWithDatabase("Agent V6 persistence with PostgreSQL", () => {
  test("persists tenant-scoped snapshots, idempotent decisions, and ordered replay events", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      const tenantA = randomUUID();
      const tenantB = randomUUID();
      const userA = randomUUID();
      const userB = randomUUID();
      const sessionId = randomUUID();
      const turnId = randomUUID();
      const repository = new AgentSessionRepository({ pool: adminPool });

      try {
        await runMigrations(adminPool);
        await withTenantTransaction({ tenantId: tenantA, userId: userA }, async (client) => {
          await client.query(`INSERT INTO users (id, email, display_name) VALUES ($1::uuid, $2, $3)`, [userA, `${userA}@example.com`, "A"]);
          await client.query(`INSERT INTO tenants (id, name, slug, updated_at) VALUES ($1::uuid, $2, $3, now())`, [tenantA, "V6 A", `v6-a-${tenantA.slice(0, 8)}`]);
          await client.query(`INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at, updated_at) VALUES ($1::uuid, $2::uuid, 'tenant_owner', 'active', now(), now())`, [tenantA, userA]);
          await client.query(`INSERT INTO agent_sessions (id, tenant_id, created_by, title) VALUES ($1::uuid, $2::uuid, $3::uuid, 'V6')`, [sessionId, tenantA, userA]);
          await client.query(`INSERT INTO agent_turns (id, tenant_id, session_id, status, agent_version, idempotency_key) VALUES ($1::uuid, $2::uuid, $3::uuid, 'planned', 'v6', 'turn-v6')`, [turnId, tenantA, sessionId]);
        }, adminPool);
        await withTenantTransaction({ tenantId: tenantB, userId: userB }, async (client) => {
          await client.query(`INSERT INTO users (id, email, display_name) VALUES ($1::uuid, $2, $3)`, [userB, `${userB}@example.com`, "B"]);
          await client.query(`INSERT INTO tenants (id, name, slug, updated_at) VALUES ($1::uuid, $2, $3, now())`, [tenantB, "V6 B", `v6-b-${tenantB.slice(0, 8)}`]);
          await client.query(`INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at, updated_at) VALUES ($1::uuid, $2::uuid, 'tenant_owner', 'active', now(), now())`, [tenantB, userB]);
        }, adminPool);

        const context = { tenantId: tenantA, userId: userA };
        const snapshot = await repository.saveV6TurnSnapshot(context, {
          sessionId,
          turnId,
          blocksJson: [{ type: "progress_card", steps: [{ id: "step-1", label: "生成", status: "running" }] }],
          contextSnapshotJson: { projectId: null, flowId: null, graphRevision: 7 },
          progressJson: [{ id: "step-1", label: "生成", status: "running" }],
          capabilityRefsJson: [{ assetId: "asset-1", skillId: "skill-1" }],
          resultRefsJson: [{ id: "result-1", assetId: "asset-2" }],
          graphRevision: 7,
          conversationPhase: "executing",
          executionState: "running",
          requiresConfirmation: true,
        });
        expect(snapshot.graphRevision).toBe(7);

        const firstDecision = await repository.recordV6Decision(context, {
          sessionId,
          turnId,
          idempotencyKey: "decision-v6-1",
          decisionJson: { type: "execute", graphRevision: 7 },
          fromPhase: "waiting_for_confirmation",
          toPhase: "executing",
        });
        const duplicateDecision = await repository.recordV6Decision(context, {
          sessionId,
          turnId,
          idempotencyKey: "decision-v6-1",
          decisionJson: { type: "execute", graphRevision: 7, changed: true },
          fromPhase: "waiting_for_confirmation",
          toPhase: "executing",
        });
        expect(duplicateDecision.id).toBe(firstDecision.id);
        expect(duplicateDecision.decisionJson).toEqual(firstDecision.decisionJson);

        const firstEvent = await repository.appendSessionEvent(context, { sessionId, turnId, agentVersion: "v6", eventType: "v6_progress", eventJson: { seq: "first" }, graphRevision: 7, idempotencyKey: "event-v6-1" });
        const secondEvent = await repository.appendSessionEvent(context, { sessionId, turnId, agentVersion: "v6", eventType: "v6_progress", eventJson: { seq: "second" }, graphRevision: 7, idempotencyKey: "event-v6-2" });
        expect(secondEvent.seq).toBeGreaterThan(firstEvent.seq);
        expect((await repository.getSessionEvents(context, sessionId)).map((event) => event.seq)).toEqual([firstEvent.seq, secondEvent.seq]);

        const appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        try {
          await expect(withAppContextTransaction(appPool, { tenantId: tenantB, userId: userB }, (client) => client.query(`SELECT id FROM agent_sessions WHERE id = $1::uuid`, [sessionId]))).resolves.toMatchObject({ rowCount: 0 });
        } finally {
          await appPool.end();
        }
      } finally {
        await adminPool.end();
      }
    });
  });
});
