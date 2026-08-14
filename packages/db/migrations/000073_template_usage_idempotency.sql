ALTER TABLE flow_template_usage
  ADD COLUMN IF NOT EXISTS template_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_template_usage_tenant_idempotency
  ON flow_template_usage (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
