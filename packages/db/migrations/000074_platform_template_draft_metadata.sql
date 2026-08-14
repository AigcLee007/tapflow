-- Published template metadata remains live until its next draft is published.
ALTER TABLE flow_templates
  ADD COLUMN IF NOT EXISTS draft_title text NULL,
  ADD COLUMN IF NOT EXISTS draft_description text NULL,
  ADD COLUMN IF NOT EXISTS draft_category text NULL,
  ADD COLUMN IF NOT EXISTS draft_cover_asset_id uuid NULL REFERENCES assets(id) ON DELETE SET NULL;
