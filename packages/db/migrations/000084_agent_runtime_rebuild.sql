-- Canonical runtime reuses existing mode, phase and plan fields. Legacy records remain.
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS runtime_version text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS graph_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS event_seq bigint NOT NULL DEFAULT 0;
ALTER TABLE agent_turns
  ADD COLUMN IF NOT EXISTS runtime_version text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS prompt text NULL,
  ADD COLUMN IF NOT EXISTS pending_decision_json jsonb NULL,
  ADD COLUMN IF NOT EXISTS initial_graph_revision bigint NULL,
  ADD COLUMN IF NOT EXISTS state_version bigint NOT NULL DEFAULT 0;

-- Composite guards prevent cross-tenant/session links even when RLS is bypassed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_sessions_tenant_id ON agent_sessions(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_turns_tenant_session_id ON agent_turns(tenant_id,session_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_tenant_id ON assets(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_runs_tenant_id ON workflow_runs(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_flows_tenant_project_id ON flows(tenant_id,project_id,id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='agent_turns'::regclass AND conname='agent_turns_tenant_session_fkey') THEN
    ALTER TABLE agent_turns ADD CONSTRAINT agent_turns_tenant_session_fkey FOREIGN KEY(tenant_id,session_id) REFERENCES agent_sessions(tenant_id,id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='agent_sessions'::regclass AND conname='agent_sessions_tenant_project_fkey') THEN
    ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_tenant_project_fkey FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='agent_sessions'::regclass AND conname='agent_sessions_tenant_project_flow_fkey') THEN
    ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_tenant_project_flow_fkey FOREIGN KEY(tenant_id,project_id,flow_id) REFERENCES flows(tenant_id,project_id,id) NOT VALID;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_turns_runtime_idempotency
  ON agent_turns(tenant_id,idempotency_key) WHERE runtime_version='runtime' AND idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_sessions_runtime_owner_updated
  ON agent_sessions(tenant_id,created_by,updated_at DESC,id) WHERE runtime_version='runtime';
CREATE INDEX IF NOT EXISTS idx_agent_turns_runtime_lease
  ON agent_turns(tenant_id,execution_state,lease_expires_at) WHERE runtime_version='runtime';

-- Pending approvals live in the turn snapshot. These rows are accepted submissions,
-- with one identity per approval; replay can never create another pending approval.
CREATE TABLE IF NOT EXISTS agent_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  decision_key text NOT NULL,
  block_id text NOT NULL,
  graph_revision bigint NOT NULL CHECK(graph_revision>=0),
  decision_type text NOT NULL,
  payload_json jsonb NOT NULL,
  idempotency_key text NOT NULL,
  confirmed_at timestamptz NULL,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  result_state text NOT NULL DEFAULT 'processing' CHECK(result_state IN ('processing','completed','failed')),
  result_snapshot_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,idempotency_key),
  UNIQUE(tenant_id,turn_id,decision_key),
  FOREIGN KEY(tenant_id,session_id,turn_id) REFERENCES agent_turns(tenant_id,session_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_turn ON agent_decisions(tenant_id,session_id,turn_id,created_at);

CREATE TABLE IF NOT EXISTS agent_capability_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  capability_type text NOT NULL,
  capability_id text NULL,
  version text NOT NULL,
  input_refs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  approval_state text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,session_id,turn_id) REFERENCES agent_turns(tenant_id,session_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_capability_refs_turn ON agent_capability_refs(tenant_id,session_id,turn_id);

CREATE TABLE IF NOT EXISTS agent_result_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  run_id uuid NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,idempotency_key),
  FOREIGN KEY(tenant_id,session_id,turn_id) REFERENCES agent_turns(tenant_id,session_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,run_id) REFERENCES workflow_runs(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_agent_result_groups_session ON agent_result_groups(tenant_id,session_id,turn_id,created_at DESC);

CREATE TABLE IF NOT EXISTS agent_result_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  result_group_id uuid NOT NULL,
  asset_id uuid NULL,
  run_id uuid NULL,
  idempotency_key text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('image','video','text')),
  label text NOT NULL,
  source_refs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  lineage_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  placed_node_id text NULL,
  status text NOT NULL DEFAULT 'ready',
  content_text text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,idempotency_key),
  FOREIGN KEY(tenant_id,result_group_id) REFERENCES agent_result_groups(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,asset_id) REFERENCES assets(tenant_id,id),
  FOREIGN KEY(tenant_id,run_id) REFERENCES workflow_runs(tenant_id,id),
  CHECK ((kind='text' AND content_text IS NOT NULL) OR (kind IN ('image','video') AND asset_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_agent_result_refs_group ON agent_result_refs(tenant_id,result_group_id,created_at,id);

-- Sole canonical event authority. Legacy task events use a global sequence;
-- canonical events allocate contiguous per-session cursors under a session lock.
CREATE TABLE IF NOT EXISTS agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  turn_id uuid NULL,
  seq bigint NOT NULL CHECK(seq>0),
  event_type text NOT NULL,
  event_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  graph_revision bigint NULL,
  idempotency_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,session_id,seq),
  UNIQUE(tenant_id,session_id,idempotency_key),
  FOREIGN KEY(tenant_id,session_id) REFERENCES agent_sessions(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,session_id,turn_id) REFERENCES agent_turns(tenant_id,session_id,id) ON DELETE CASCADE
);
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['agent_decisions','agent_capability_refs','agent_result_groups','agent_result_refs','agent_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I',table_name || '_current_tenant',table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id())',table_name || '_current_tenant',table_name);
  END LOOP;
END $$;
