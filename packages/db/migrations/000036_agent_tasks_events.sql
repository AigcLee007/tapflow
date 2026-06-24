CREATE TABLE IF NOT EXISTS agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  turn_id uuid NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
  task_key text NOT NULL,
  task_type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL,
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_json jsonb NULL,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_tenant_session_created
  ON agent_tasks(tenant_id, session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_tenant_turn_created
  ON agent_tasks(tenant_id, turn_id, created_at ASC)
  WHERE turn_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  turn_id uuid NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
  task_id uuid NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  event_type text NOT NULL,
  event_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_task_events_session_seq
  ON agent_task_events(tenant_id, session_id, seq ASC);

ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_tasks_select_current_tenant ON agent_tasks;
CREATE POLICY agent_tasks_select_current_tenant
  ON agent_tasks
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS agent_tasks_insert_current_tenant ON agent_tasks;
CREATE POLICY agent_tasks_insert_current_tenant
  ON agent_tasks
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS agent_tasks_update_current_tenant ON agent_tasks;
CREATE POLICY agent_tasks_update_current_tenant
  ON agent_tasks
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS agent_tasks_delete_current_tenant ON agent_tasks;
CREATE POLICY agent_tasks_delete_current_tenant
  ON agent_tasks
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

ALTER TABLE agent_task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_task_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_task_events_select_current_tenant ON agent_task_events;
CREATE POLICY agent_task_events_select_current_tenant
  ON agent_task_events
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS agent_task_events_insert_current_tenant ON agent_task_events;
CREATE POLICY agent_task_events_insert_current_tenant
  ON agent_task_events
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS agent_task_events_update_current_tenant ON agent_task_events;
CREATE POLICY agent_task_events_update_current_tenant
  ON agent_task_events
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS agent_task_events_delete_current_tenant ON agent_task_events;
CREATE POLICY agent_task_events_delete_current_tenant
  ON agent_task_events
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());
