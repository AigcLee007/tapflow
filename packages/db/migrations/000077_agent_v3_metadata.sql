-- V3 task/event idempotency is isolated from legacy and V2 records.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tasks_v3_idempotency
  ON agent_tasks(tenant_id, idempotency_key)
  WHERE agent_version = 'v3' AND idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_task_events_v3_idempotency
  ON agent_task_events(tenant_id, idempotency_key)
  WHERE agent_version = 'v3' AND idempotency_key IS NOT NULL;
