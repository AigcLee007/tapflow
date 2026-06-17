CREATE TABLE IF NOT EXISTS workbench_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Workbench',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_workbench_sessions_tenant_updated
  ON workbench_sessions(tenant_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS workbench_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NULL REFERENCES workbench_sessions(id) ON DELETE SET NULL,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  prompt text NOT NULL,
  model_id text NOT NULL,
  route_key text NOT NULL,
  params_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reference_asset_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  requested_count int NOT NULL DEFAULT 1 CHECK (requested_count BETWEEN 1 AND 8),
  display_mode text NOT NULL DEFAULT 'merged' CHECK (display_mode IN ('merged', 'separate')),
  estimated_credits numeric(12, 4) NOT NULL DEFAULT 0,
  charged_credits numeric(12, 4) NULL,
  reserved_credits numeric(12, 4) NOT NULL DEFAULT 0,
  billing_usage_event_id uuid NULL REFERENCES usage_events(id) ON DELETE SET NULL,
  reserve_ledger_id uuid NULL REFERENCES billing_ledger(id) ON DELETE SET NULL,
  settle_ledger_id uuid NULL REFERENCES billing_ledger(id) ON DELETE SET NULL,
  refund_ledger_id uuid NULL REFERENCES billing_ledger(id) ON DELETE SET NULL,
  provider_task_id text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'running', 'waiting_provider', 'succeeded', 'failed', 'canceled')),
  error_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  finished_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_workbench_generations_tenant_created
  ON workbench_generations(tenant_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_workbench_generations_tenant_session_created
  ON workbench_generations(tenant_id, session_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_workbench_generations_tenant_status
  ON workbench_generations(tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS workbench_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  generation_id uuid NOT NULL REFERENCES workbench_generations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (generation_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_workbench_results_tenant_generation_order
  ON workbench_results(tenant_id, generation_id, sort_order ASC, created_at ASC);

ALTER TABLE workbench_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbench_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY workbench_sessions_select_current_tenant
  ON workbench_sessions
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_sessions_insert_current_tenant
  ON workbench_sessions
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_sessions_update_current_tenant
  ON workbench_sessions
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_sessions_delete_current_tenant
  ON workbench_sessions
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

ALTER TABLE workbench_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbench_generations FORCE ROW LEVEL SECURITY;

CREATE POLICY workbench_generations_select_current_tenant
  ON workbench_generations
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_generations_insert_current_tenant
  ON workbench_generations
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_generations_update_current_tenant
  ON workbench_generations
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_generations_delete_current_tenant
  ON workbench_generations
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

ALTER TABLE workbench_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbench_results FORCE ROW LEVEL SECURITY;

CREATE POLICY workbench_results_select_current_tenant
  ON workbench_results
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_results_insert_current_tenant
  ON workbench_results
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_results_update_current_tenant
  ON workbench_results
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_results_delete_current_tenant
  ON workbench_results
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());
