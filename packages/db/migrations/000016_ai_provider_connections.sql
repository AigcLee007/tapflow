CREATE TABLE IF NOT EXISTS ai_provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider_id uuid NOT NULL REFERENCES ai_providers(id),
  credential_id uuid REFERENCES api_credentials(id),
  name text NOT NULL,
  adapter_kind text NOT NULL,
  base_url text,
  environment text NOT NULL DEFAULT 'production',
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_health_status text,
  last_health_checked_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_provider_connections_tenant_provider_status_idx
  ON ai_provider_connections (tenant_id, provider_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS ai_provider_connections_tenant_name_unique_idx
  ON ai_provider_connections (tenant_id, name);

ALTER TABLE ai_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_provider_connections FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_provider_connections_select_current_tenant
  ON ai_provider_connections
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY ai_provider_connections_insert_current_tenant
  ON ai_provider_connections
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY ai_provider_connections_update_current_tenant
  ON ai_provider_connections
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY ai_provider_connections_delete_current_tenant
  ON ai_provider_connections
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

