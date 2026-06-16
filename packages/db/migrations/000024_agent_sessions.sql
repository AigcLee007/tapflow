CREATE TABLE IF NOT EXISTS agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL,
  flow_id uuid NULL REFERENCES flows(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Canvas Agent',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_tenant_project_updated
  ON agent_sessions(tenant_id, project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_tenant_flow_updated
  ON agent_sessions(tenant_id, flow_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_tenant_session_created
  ON agent_messages(tenant_id, session_id, created_at ASC);

CREATE TABLE IF NOT EXISTS agent_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  user_message_id uuid NULL REFERENCES agent_messages(id) ON DELETE SET NULL,
  assistant_message_id uuid NULL REFERENCES agent_messages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'planned', 'failed')),
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_turns_tenant_session_created
  ON agent_turns(tenant_id, session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  permission_level text NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'executed', 'failed')),
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_json jsonb NULL,
  requires_approval boolean NOT NULL DEFAULT true,
  approved_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_tenant_turn_created
  ON agent_tool_calls(tenant_id, turn_id, created_at ASC);

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY agent_sessions_select_current_tenant
  ON agent_sessions
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY agent_sessions_insert_current_tenant
  ON agent_sessions
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY agent_sessions_update_current_tenant
  ON agent_sessions
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY agent_sessions_delete_current_tenant
  ON agent_sessions
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY agent_messages_select_current_tenant
  ON agent_messages
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY agent_messages_insert_current_tenant
  ON agent_messages
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY agent_messages_update_current_tenant
  ON agent_messages
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY agent_messages_delete_current_tenant
  ON agent_messages
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

ALTER TABLE agent_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_turns FORCE ROW LEVEL SECURITY;

CREATE POLICY agent_turns_select_current_tenant
  ON agent_turns
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY agent_turns_insert_current_tenant
  ON agent_turns
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY agent_turns_update_current_tenant
  ON agent_turns
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY agent_turns_delete_current_tenant
  ON agent_turns
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

ALTER TABLE agent_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tool_calls FORCE ROW LEVEL SECURITY;

CREATE POLICY agent_tool_calls_select_current_tenant
  ON agent_tool_calls
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY agent_tool_calls_insert_current_tenant
  ON agent_tool_calls
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY agent_tool_calls_update_current_tenant
  ON agent_tool_calls
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY agent_tool_calls_delete_current_tenant
  ON agent_tool_calls
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());
