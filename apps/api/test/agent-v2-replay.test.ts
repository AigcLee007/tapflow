import { describe, expect, test, vi } from "vitest";

import { AgentEventService } from "../src/modules/agent/agent-event.service.js";
import { AgentSessionRepository } from "../src/modules/agent/agent-session.repository.js";

describe("AgentEventService V2 replay guards", () => {
  test("persists V2 event metadata for deterministic replay and deduplication", async () => {
    const appendSessionEvent = vi.fn(async (_context, input) => ({
      createdAt: "2026-08-20T00:00:00.000Z",
      eventJson: input.eventJson,
      eventType: input.eventType,
      id: "event-v2-1",
      seq: 4,
      sessionId: input.sessionId,
      taskId: input.taskId ?? null,
      turnId: input.turnId ?? null,
    }));
    const service = new AgentEventService({
      pool: {} as never,
      repository: {
        appendSessionEvent,
        getSessionEvents: vi.fn(),
      },
    });

    await service.appendToolEvent(
      { tenantId: "tenant-1", userId: "user-1" },
      "session-1",
      {
        graphRevision: 7,
        idempotencyKey: "turn-1:tool-1",
        redactionVersion: "v2",
        skillVersionId: "skill-version-1",
        taskId: "task-1",
        toolCallKey: "tool-1",
        toolName: "canvas.run_nodes",
        turnId: "turn-1",
        type: "tool_started",
        agentVersion: "v2",
      },
    );

    expect(appendSessionEvent).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: "user-1" },
      expect.objectContaining({
        agentVersion: "v2",
        eventJson: expect.objectContaining({
          graphRevision: 7,
          idempotencyKey: "turn-1:tool-1",
          redactionVersion: "v2",
          skillVersionId: "skill-version-1",
        }),
        graphRevision: 7,
        idempotencyKey: "turn-1:tool-1",
        sessionId: "session-1",
        turnId: "turn-1",
      }),
    );
  });

  test("does not append a V2 mutation after durable cancellation", async () => {
    const appendSessionEvent = vi.fn();
    const assertTurnActive = vi.fn().mockRejectedValue(new Error("AGENT_TURN_CANCELLED"));
    const service = new AgentEventService({
      pool: {} as never,
      repository: {
        appendSessionEvent,
        assertTurnActive,
        getSessionEvents: vi.fn(),
      },
    });

    await expect(service.appendToolEvent(
      { tenantId: "tenant-1", userId: "user-1" },
      "session-1",
      {
        agentVersion: "v2",
        idempotencyKey: "turn-1:tool-1",
        toolCallKey: "tool-1",
        toolName: "canvas.apply_ops",
        turnId: "turn-1",
        type: "tool_started",
      },
    )).rejects.toThrow("AGENT_TURN_CANCELLED");
    expect(appendSessionEvent).not.toHaveBeenCalled();
  });
});

describe("AgentSessionRepository V2 turn leases", () => {
  function createPool(updateRows: Array<{ expires_at: string; id: string }>) {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("UPDATE agent_turns\n          SET lease_owner")) {
          return { rowCount: updateRows.length, rows: updateRows };
        }
        return { rowCount: 0, rows: [] };
      }),
      release: vi.fn(),
    };
    return { client, connect: vi.fn(async () => client) };
  }

  test("bounds a turn lease to five minutes and returns the acquired owner", async () => {
    const pool = createPool([{ expires_at: "2026-08-20T00:05:00.000Z", id: "turn-1" }]);
    const repository = new AgentSessionRepository({ pool: pool as never });

    const lease = await repository.acquireTurnLease(
      { tenantId: "tenant-1", userId: "user-1" },
      { leaseMs: 999_999, leaseOwner: "worker-1", turnId: "turn-1" },
    );

    expect(lease).toEqual({
      expiresAt: "2026-08-20T00:05:00.000Z",
      leaseOwner: "worker-1",
      turnId: "turn-1",
    });
    const update = pool.client.query.mock.calls.find(([sql]) => sql.includes("UPDATE agent_turns\n          SET lease_owner"));
    expect(update?.[1]).toEqual(["tenant-1", "turn-1", "worker-1", 300_000]);
  });

  test("rejects a non-positive lease instead of creating an unbounded lock", async () => {
    const repository = new AgentSessionRepository({ pool: {} as never });

    await expect(repository.acquireTurnLease(
      { tenantId: "tenant-1", userId: "user-1" },
      { leaseMs: 0, leaseOwner: "worker-1", turnId: "turn-1" },
    )).rejects.toThrow("AGENT_TURN_LEASE_INVALID");
  });

  test("returns no lease when another worker owns the unexpired turn lease", async () => {
    const pool = createPool([]);
    const repository = new AgentSessionRepository({ pool: pool as never });

    await expect(repository.acquireTurnLease(
      { tenantId: "tenant-1", userId: "user-1" },
      { leaseMs: 10_000, leaseOwner: "worker-2", turnId: "turn-1" },
    )).resolves.toBeNull();
  });
});
