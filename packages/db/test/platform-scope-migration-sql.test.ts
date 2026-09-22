import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

test("global AI writes require an explicit platform scope", async () => {
  const sql = await readFile(path.resolve(import.meta.dirname, "../migrations/000094_platform_ai_write_scopes.sql"), "utf8");
  expect(sql).toContain("app.platform_scope_allows(ARRAY['platform:pricing:publish'])");
  expect(sql).toContain("app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish'])");
  expect(sql).toContain("app.platform_scope_allows(ARRAY['platform:connections:manage','platform:routes:write','platform:pricing:publish'])");
  expect(sql).not.toContain("current_platform_role() = 'platform_super_admin'");
});

test("task inspection keeps lifecycle and request rows owner-scoped", async () => {
  const sql = await readFile(path.resolve(import.meta.dirname, "../migrations/000095_console_task_inspection.sql"), "utf8");
  expect(sql).toContain("workflow_run_events_console_self_read");
  expect(sql).toContain("agent_task_events_console_self_read");
  expect(sql).toContain("ai_call_logs_console_self_read");
  expect(sql).toContain("actor_user_id=app.current_user_id()");
  expect(sql).toContain("billed_user_id=app.current_user_id()");
  expect(sql).not.toContain("USING (true)");
});
