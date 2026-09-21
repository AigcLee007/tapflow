import { describe, expect, it } from "vitest";

import { AgentRuntimeRepository, type AgentRuntimeTurnInput } from "./agent-runtime.repository.js";

function fakePool() {
  const queries: string[] = [];
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK" || sql.startsWith("SELECT set_config")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM agent_sessions")) return { rows: [{ id: "00000000-0000-0000-0000-000000000001", tenant_id: "00000000-0000-0000-0000-000000000002", project_id: null, flow_id: null, title: "Agent", mode: "manual_confirmation", phase: "idle", graph_revision: "4", status: "active" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  return { queries, connect: async () => client } as never;
}

describe("AgentRuntimeRepository", () => {
  it("uses a runtime idempotency key and tenant scoped insert", async () => {
    const pool = fakePool();
    const repository = new AgentRuntimeRepository({ pool });
    const input: AgentRuntimeTurnInput = {
      sessionId: "00000000-0000-0000-0000-000000000001",
      prompt: "生成首尾帧素材",
      graphRevision: 4,
      idempotencyKey: "turn-1",
      contextSnapshot: { projectId: null, flowId: null, graphRevision: 4, refs: [], skillIds: [], appIds: [], modelKey: null },
    };
    await expect(repository.createTurnIdempotent({ tenantId: "00000000-0000-0000-0000-000000000002", userId: null }, input)).rejects.toThrow("AGENT_TURN_IDEMPOTENCY_CONFLICT");
    expect(pool.queries.some((query) => query.includes("runtime_version"))).toBe(true);
    expect(pool.queries.some((query) => query.includes("tenant_id"))).toBe(true);
  });
});
