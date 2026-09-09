ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'manual_confirmation',
  ADD COLUMN IF NOT EXISTS conversation_phase text NOT NULL DEFAULT 'idle';

ALTER TABLE agent_sessions
  DROP CONSTRAINT IF EXISTS agent_sessions_execution_mode_check;
ALTER TABLE agent_sessions
  ADD CONSTRAINT agent_sessions_execution_mode_check
  CHECK (execution_mode IN ('auto', 'manual_confirmation'));

ALTER TABLE agent_turns
  ADD COLUMN IF NOT EXISTS blocks_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS conversation_phase text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS execution_state text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_agent_turns_v5_phase
  ON agent_turns(tenant_id, session_id, conversation_phase, created_at DESC);

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_turns FORCE ROW LEVEL SECURITY;
