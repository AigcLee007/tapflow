-- Canonical Agent Runtime extends the existing tenant-scoped session/turn/event
-- records. Legacy V5/V6 rows remain readable and are never deleted.
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS runtime_version text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'manual_confirmation',
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS graph_revision bigint NOT NULL DEFAULT 0;

ALTER TABLE agent_turns
  ADD COLUMN IF NOT EXISTS runtime_version text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS prompt text NULL,
  ADD COLUMN IF NOT EXISTS pending_decision_json jsonb NULL,
  ADD COLUMN IF NOT EXISTS execution_state text NOT NULL DEFAULT 'idle';

CREATE TABLE IF NOT EXISTS agent_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
  block_id text NOT NULL,
  decision_type text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  confirmed_at timestamptz NULL,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  result_state text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_capability_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
  capability_type text NOT NULL,
  capability_id text NULL,
  version text NOT NULL,
  input_refs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  approval_state text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_result_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
  run_id uuid NULL REFERENCES workflow_runs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_result_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  result_group_id uuid NOT NULL REFERENCES agent_result_groups(id) ON DELETE CASCADE,
  asset_id uuid NULL REFERENCES assets(id) ON DELETE SET NULL,
  kind text NOT NULL,
  label text NOT NULL,
  source_refs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  lineage_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  placed_node_id text NULL,
  status text NOT NULL DEFAULT 'pending',
  content_text text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  turn_id uuid NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  event_type text NOT NULL,
  event_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  graph_revision bigint NULL,
  idempotency_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_events_tenant_session_seq_unique UNIQUE (tenant_id, session_id, seq)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_decisions_tenant_idempotency
  ON agent_decisions(tenant_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_turns_runtime_idempotency
  ON agent_turns(tenant_id, idempotency_key)
  WHERE runtime_version = 'runtime' AND idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_events_session_seq
  ON agent_events(tenant_id, session_id, seq);
CREATE INDEX IF NOT EXISTS idx_agent_result_groups_session
  ON agent_result_groups(tenant_id, session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_result_refs_group
  ON agent_result_refs(tenant_id, result_group_id, created_at ASC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['agent_decisions', 'agent_capability_refs', 'agent_result_groups', 'agent_result_refs', 'agent_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_select_current_tenant ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert_current_tenant ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_update_current_tenant ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete_current_tenant ON %I', table_name, table_name);
    EXECUTE format('CREATE POLICY %I_select_current_tenant ON %I FOR SELECT USING (tenant_id = app.current_tenant_id())', table_name, table_name);
    EXECUTE format('CREATE POLICY %I_insert_current_tenant ON %I FOR INSERT WITH CHECK (tenant_id = app.current_tenant_id())', table_name, table_name);
    EXECUTE format('CREATE POLICY %I_update_current_tenant ON %I FOR UPDATE USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())', table_name, table_name);
    EXECUTE format('CREATE POLICY %I_delete_current_tenant ON %I FOR DELETE USING (tenant_id = app.current_tenant_id())', table_name, table_name);
  END LOOP;
END $$;
