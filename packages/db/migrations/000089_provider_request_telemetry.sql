-- Historical adapter-level logs remain summaries with unknown provenance.
-- A request row is emitted only by the physical provider fetch boundary.
ALTER TABLE ai_call_logs
  ADD COLUMN record_level text NOT NULL DEFAULT 'summary' CHECK (record_level IN ('summary', 'request')),
  ADD COLUMN operation text CHECK (operation IN ('generate', 'submit', 'poll', 'stream')),
  ADD COLUMN traffic_class text NOT NULL DEFAULT 'unknown' CHECK (traffic_class IN ('user_generation', 'admin_test', 'agent_control', 'system', 'unknown')),
  ADD COLUMN source text NOT NULL DEFAULT 'unknown',
  ADD COLUMN execution_id text,
  ADD COLUMN actor_user_id uuid,
  ADD COLUMN billed_user_id uuid,
  ADD COLUMN trace_id text,
  ADD COLUMN attempt int CHECK (attempt > 0),
  ADD COLUMN provider_request_id text,
  ADD COLUMN provider_task_id text,
  ADD COLUMN request_started_at timestamptz,
  ADD COLUMN request_completed_at timestamptz,
  ADD COLUMN request_dispatched boolean,
  ADD COLUMN http_status int CHECK (http_status BETWEEN 100 AND 599);

COMMENT ON COLUMN ai_call_logs.attempt IS 'Physical request ordinal within this adapter invocation, not an inferred retry count. Historical and summary rows are NULL.';
COMMENT ON COLUMN ai_call_logs.request_completed_at IS 'Physical fetch response headers or network failure time; streaming completion is a separate runtime outcome.';
COMMENT ON COLUMN ai_call_logs.billed_user_id IS 'Explicit billing identity only; NULL when not supplied. Never inferred from actor identity.';

CREATE INDEX ai_call_logs_tenant_execution_request_idx ON ai_call_logs(tenant_id, execution_id, created_at, id) WHERE record_level = 'request';
CREATE INDEX ai_call_logs_physical_created_idx ON ai_call_logs(created_at DESC, id DESC) WHERE record_level = 'request' AND request_dispatched;

-- Private runtime state: never projected by the console or canvas APIs.
-- Existing tasks without a snapshot keep the legacy route-resolution fallback.
CREATE TABLE ai_provider_task_routes (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  execution_id text NOT NULL,
  provider_task_id text NOT NULL,
  route_snapshot jsonb NOT NULL,
  credential_id uuid NOT NULL REFERENCES api_credentials(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, execution_id, provider_task_id)
);
ALTER TABLE ai_provider_task_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_provider_task_routes FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_provider_task_routes_tenant_select ON ai_provider_task_routes FOR SELECT
  USING (tenant_id = app.current_tenant_id());
CREATE POLICY ai_provider_task_routes_tenant_insert ON ai_provider_task_routes FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());
