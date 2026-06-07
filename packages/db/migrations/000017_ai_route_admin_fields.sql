ALTER TABLE ai_routes
  ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES ai_provider_connections(id),
  ADD COLUMN IF NOT EXISTS upstream_model text,
  ADD COLUMN IF NOT EXISTS api_mode text,
  ADD COLUMN IF NOT EXISTS request_path text,
  ADD COLUMN IF NOT EXISTS internal_label text,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS health_status text,
  ADD COLUMN IF NOT EXISTS last_health_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS ai_routes_tenant_connection_idx
  ON ai_routes (tenant_id, connection_id)
  WHERE connection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_routes_tenant_model_status_default_idx
  ON ai_routes (tenant_id, model_family, status, is_default);

