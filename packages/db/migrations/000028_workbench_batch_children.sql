ALTER TABLE workbench_generations
  ADD COLUMN IF NOT EXISTS batch_id uuid NULL,
  ADD COLUMN IF NOT EXISTS parent_generation_id uuid NULL REFERENCES workbench_generations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS batch_role text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS batch_index int NULL,
  ADD COLUMN IF NOT EXISTS batch_total int NULL;

ALTER TABLE workbench_generations
  DROP CONSTRAINT IF EXISTS workbench_generations_batch_role_check;

ALTER TABLE workbench_generations
  ADD CONSTRAINT workbench_generations_batch_role_check
  CHECK (batch_role IN ('single', 'parent', 'child'));

ALTER TABLE workbench_generations
  DROP CONSTRAINT IF EXISTS workbench_generations_batch_shape_check;

ALTER TABLE workbench_generations
  ADD CONSTRAINT workbench_generations_batch_shape_check
  CHECK (
    (batch_role = 'single' AND parent_generation_id IS NULL AND batch_index IS NULL AND batch_total IS NULL)
    OR
    (batch_role = 'parent' AND parent_generation_id IS NULL AND batch_index IS NULL AND batch_total BETWEEN 2 AND 8)
    OR
    (batch_role = 'child' AND parent_generation_id IS NOT NULL AND batch_index BETWEEN 0 AND 7 AND batch_total BETWEEN 2 AND 8)
  );

CREATE INDEX IF NOT EXISTS idx_workbench_generations_tenant_batch_parent
  ON workbench_generations(tenant_id, parent_generation_id, batch_index ASC)
  WHERE parent_generation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workbench_generations_tenant_batch_id
  ON workbench_generations(tenant_id, batch_id, batch_index ASC, id ASC)
  WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workbench_generations_tenant_visible_parent_single_created
  ON workbench_generations(tenant_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND batch_role IN ('single', 'parent');
