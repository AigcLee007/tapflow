ALTER TABLE ai_call_logs
  ADD COLUMN IF NOT EXISTS product_model_key text,
  ADD COLUMN IF NOT EXISTS route_key_snapshot text,
  ADD COLUMN IF NOT EXISTS route_label_snapshot text,
  ADD COLUMN IF NOT EXISTS provider_key_snapshot text,
  ADD COLUMN IF NOT EXISTS provider_name_snapshot text,
  ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES ai_provider_connections(id),
  ADD COLUMN IF NOT EXISTS connection_name_snapshot text,
  ADD COLUMN IF NOT EXISTS adapter_kind_snapshot text,
  ADD COLUMN IF NOT EXISTS api_mode_snapshot text,
  ADD COLUMN IF NOT EXISTS upstream_model_snapshot text,
  ADD COLUMN IF NOT EXISTS request_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS response_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS ai_call_logs_tenant_route_snapshot_created_idx
  ON ai_call_logs (tenant_id, route_key_snapshot, created_at DESC);
