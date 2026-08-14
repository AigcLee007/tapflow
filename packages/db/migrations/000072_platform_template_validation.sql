-- A template may only be published after the exact persisted draft graph has
-- been validated by the server. The hash prevents a later edit from reusing
-- an earlier validation result.
ALTER TABLE flow_templates
  ADD COLUMN IF NOT EXISTS last_tested_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_tested_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_tested_graph_hash text NULL;
