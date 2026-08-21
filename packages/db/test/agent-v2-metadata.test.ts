import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const migrationPath = path.resolve(import.meta.dirname, "../migrations/000075_agent_v2_metadata.sql");

describe("agent v2 metadata migration", () => {
  test("declares tenant-scoped replay metadata, leases, and RLS-safe unique guards", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/ALTER TABLE agent_turns[\s\S]*agent_version/);
    expect(sql).toMatch(/ALTER TABLE agent_turns[\s\S]*agent_namespace/);
    expect(sql).toMatch(/ALTER TABLE agent_turns[\s\S]*graph_revision/);
    expect(sql).toMatch(/ALTER TABLE agent_turns[\s\S]*idempotency_key/);
    expect(sql).toMatch(/ALTER TABLE agent_turns[\s\S]*cancelled_at/);
    expect(sql).toMatch(/lease_owner/);
    expect(sql).toMatch(/lease_expires_at/);
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS agent_turns_status_check/);
    expect(sql).toMatch(/CHECK \(status IN \('pending', 'planned', 'running', 'succeeded', 'failed', 'cancelled'\)\)/);
    expect(sql).toMatch(/agent_tool_calls[\s\S]*agent_version/);
    expect(sql).toMatch(/agent_tasks[\s\S]*agent_version/);
    expect(sql).toMatch(/agent_task_events[\s\S]*agent_version/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]*agent_turns[^;]*idempotency_key/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]*agent_tool_calls[^;]*idempotency_key/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]*agent_tasks[^;]*idempotency_key/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]*agent_task_events[^;]*idempotency_key/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });
});
