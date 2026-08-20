-- V2 agent records remain nullable so legacy sessions and tool calls keep their original shape.
ALTER TABLE agent_turns
  ADD COLUMN IF NOT EXISTS agent_namespace text NULL,
  ADD COLUMN IF NOT EXISTS agent_version text NULL,
  ADD COLUMN IF NOT EXISTS graph_revision bigint NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS lease_owner text NULL,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz NULL;

ALTER TABLE agent_tool_calls
  ADD COLUMN IF NOT EXISTS agent_namespace text NULL,
  ADD COLUMN IF NOT EXISTS agent_version text NULL,
  ADD COLUMN IF NOT EXISTS graph_revision bigint NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text NULL;

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS agent_namespace text NULL,
  ADD COLUMN IF NOT EXISTS agent_version text NULL,
  ADD COLUMN IF NOT EXISTS graph_revision bigint NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text NULL;

ALTER TABLE agent_task_events
  ADD COLUMN IF NOT EXISTS agent_namespace text NULL,
  ADD COLUMN IF NOT EXISTS agent_version text NULL,
  ADD COLUMN IF NOT EXISTS graph_revision bigint NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'agent_turns'::regclass
      AND conname = 'agent_turns_graph_revision_check'
  ) THEN
    ALTER TABLE agent_turns
      ADD CONSTRAINT agent_turns_graph_revision_check
      CHECK (graph_revision IS NULL OR graph_revision >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'agent_tool_calls'::regclass
      AND conname = 'agent_tool_calls_graph_revision_check'
  ) THEN
    ALTER TABLE agent_tool_calls
      ADD CONSTRAINT agent_tool_calls_graph_revision_check
      CHECK (graph_revision IS NULL OR graph_revision >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'agent_tasks'::regclass
      AND conname = 'agent_tasks_graph_revision_check'
  ) THEN
    ALTER TABLE agent_tasks
      ADD CONSTRAINT agent_tasks_graph_revision_check
      CHECK (graph_revision IS NULL OR graph_revision >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'agent_task_events'::regclass
      AND conname = 'agent_task_events_graph_revision_check'
  ) THEN
    ALTER TABLE agent_task_events
      ADD CONSTRAINT agent_task_events_graph_revision_check
      CHECK (graph_revision IS NULL OR graph_revision >= 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_turns_v2_idempotency
  ON agent_turns(tenant_id, idempotency_key)
  WHERE agent_version = 'v2' AND idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tool_calls_v2_idempotency
  ON agent_tool_calls(tenant_id, idempotency_key)
  WHERE agent_version = 'v2' AND idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tasks_v2_idempotency
  ON agent_tasks(tenant_id, idempotency_key)
  WHERE agent_version = 'v2' AND idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_task_events_v2_idempotency
  ON agent_task_events(tenant_id, idempotency_key)
  WHERE agent_version = 'v2' AND idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_turns_v2_lease
  ON agent_turns(tenant_id, lease_expires_at)
  WHERE agent_version = 'v2' AND lease_expires_at IS NOT NULL;

ALTER TABLE agent_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_turns FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tool_calls FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_task_events FORCE ROW LEVEL SECURITY;
