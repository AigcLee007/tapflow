CREATE TABLE IF NOT EXISTS workbench_reference_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  original_filename text NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  width int NULL,
  height int NULL,
  bytes bytea NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  used_at timestamptz NULL
);

ALTER TABLE workbench_generations
  ADD COLUMN IF NOT EXISTS reference_upload_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

CREATE INDEX IF NOT EXISTS idx_workbench_reference_uploads_tenant_created
  ON workbench_reference_uploads(tenant_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_workbench_reference_uploads_tenant_expires
  ON workbench_reference_uploads(tenant_id, expires_at ASC)
  WHERE status = 'active';

ALTER TABLE workbench_reference_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbench_reference_uploads FORCE ROW LEVEL SECURITY;

CREATE POLICY workbench_reference_uploads_select_current_tenant
  ON workbench_reference_uploads
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_reference_uploads_insert_current_tenant
  ON workbench_reference_uploads
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_reference_uploads_update_current_tenant
  ON workbench_reference_uploads
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_reference_uploads_delete_current_tenant
  ON workbench_reference_uploads
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());
