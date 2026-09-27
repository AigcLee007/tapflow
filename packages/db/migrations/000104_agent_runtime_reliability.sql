-- P0 Agent runtime reliability. This migration is additive; V5/V6 rows remain intact.
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS state_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replay_cursor text NULL;

ALTER TABLE agent_turns
  ADD COLUMN IF NOT EXISTS state_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replay_cursor text NULL;

ALTER TABLE agent_decisions
  ADD COLUMN IF NOT EXISTS graph_revision bigint NULL,
  ADD COLUMN IF NOT EXISTS allowed_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS response_json jsonb NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz NULL;

ALTER TABLE agent_events
  ADD COLUMN IF NOT EXISTS state_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replay_cursor text NULL;

-- Planner failures are persisted as recoverable runtime turns. Keep all
-- historical statuses valid while extending the existing V5/V6 check.
ALTER TABLE agent_turns DROP CONSTRAINT IF EXISTS agent_turns_status_check;
ALTER TABLE agent_turns
  ADD CONSTRAINT agent_turns_status_check
  CHECK (status IN ('pending', 'planned', 'running', 'succeeded', 'failed', 'cancelled', 'recoverable_error'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_decisions_tenant_session_idempotency
  ON agent_decisions (tenant_id, session_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_pending_scope
  ON agent_decisions (tenant_id, session_id, turn_id, result_state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_replay_cursor
  ON agent_events (tenant_id, session_id, seq);

UPDATE agent_events SET state_version = seq, replay_cursor = id::text WHERE state_version = 0 OR replay_cursor IS NULL;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['agent_sessions', 'agent_turns'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;
