-- Keep a published template visible while its next revision is being edited.
ALTER TABLE flow_templates
  ADD COLUMN IF NOT EXISTS draft_graph_json jsonb NULL,
  ADD COLUMN IF NOT EXISTS draft_input_schema jsonb NULL,
  ADD COLUMN IF NOT EXISTS draft_node_count integer NULL CHECK (draft_node_count >= 0),
  ADD COLUMN IF NOT EXISTS draft_estimated_credits numeric(12, 4) NULL CHECK (draft_estimated_credits >= 0),
  ADD COLUMN IF NOT EXISTS draft_status text NULL;

ALTER TABLE flow_templates
  DROP CONSTRAINT IF EXISTS flow_templates_draft_status_check,
  ADD CONSTRAINT flow_templates_draft_status_check
    CHECK (draft_status IS NULL OR draft_status IN ('draft', 'testing'));
