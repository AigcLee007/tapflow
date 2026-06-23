ALTER TABLE agent_tool_calls
  ADD COLUMN IF NOT EXISTS session_id uuid NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS parent_tool_call_id uuid NULL REFERENCES agent_tool_calls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tool_call_key text,
  ADD COLUMN IF NOT EXISTS arguments_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cost_estimate_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS workflow_run_id uuid NULL REFERENCES workflow_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS node_run_id uuid NULL REFERENCES node_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz NULL;

UPDATE agent_tool_calls
SET
  session_id = agent_turns.session_id,
  tool_call_key = COALESCE(agent_tool_calls.tool_call_key, agent_tool_calls.id::text),
  arguments_json = CASE
    WHEN agent_tool_calls.arguments_json = '{}'::jsonb AND agent_tool_calls.input_json <> '{}'::jsonb
      THEN agent_tool_calls.input_json
    ELSE agent_tool_calls.arguments_json
  END,
  result_json = CASE
    WHEN agent_tool_calls.result_json = '{}'::jsonb AND agent_tool_calls.output_json <> '{}'::jsonb
      THEN agent_tool_calls.output_json
    ELSE agent_tool_calls.result_json
  END
FROM agent_turns
WHERE agent_tool_calls.turn_id = agent_turns.id
  AND (
    agent_tool_calls.session_id IS NULL
    OR agent_tool_calls.tool_call_key IS NULL
    OR (agent_tool_calls.arguments_json = '{}'::jsonb AND agent_tool_calls.input_json <> '{}'::jsonb)
    OR (agent_tool_calls.result_json = '{}'::jsonb AND agent_tool_calls.output_json <> '{}'::jsonb)
  );

ALTER TABLE agent_tool_calls
  ALTER COLUMN tool_call_key SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM agent_tool_calls
    WHERE session_id IS NULL
  ) THEN
    RAISE EXCEPTION 'agent_tool_calls.session_id backfill failed';
  END IF;
END $$;

ALTER TABLE agent_tool_calls
  ALTER COLUMN session_id SET NOT NULL;

DO $$
DECLARE
  constraint_record record;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'agent_tool_calls'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE agent_tool_calls DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;

  ALTER TABLE agent_tool_calls
    ADD CONSTRAINT agent_tool_calls_executor_status_check
    CHECK (status IN (
      'proposed',
      'approved',
      'executed',
      'planned',
      'awaiting_approval',
      'running',
      'succeeded',
      'failed',
      'cancelled',
      'skipped'
    )) NOT VALID;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_tenant_session_created
  ON agent_tool_calls(tenant_id, session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_workflow_run
  ON agent_tool_calls(workflow_run_id)
  WHERE workflow_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_node_run
  ON agent_tool_calls(node_run_id)
  WHERE node_run_id IS NOT NULL;
