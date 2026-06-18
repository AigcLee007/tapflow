ALTER TABLE workbench_generations
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workbench_generations_tenant_visible_created
  ON workbench_generations(tenant_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workbench_generations_tenant_visible_status
  ON workbench_generations(tenant_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;
