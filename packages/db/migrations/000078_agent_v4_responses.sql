-- V4 task/event idempotency is isolated from legacy, V2 and V3 records.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tasks_v4_idempotency
  ON agent_tasks(tenant_id, idempotency_key)
  WHERE agent_version = 'v4' AND idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_task_events_v4_idempotency
  ON agent_task_events(tenant_id, idempotency_key)
  WHERE agent_version = 'v4' AND idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_tasks_v4_status
  ON agent_tasks(tenant_id, status, created_at DESC)
  WHERE agent_version = 'v4';
