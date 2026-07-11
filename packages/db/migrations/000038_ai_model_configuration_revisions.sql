ALTER TABLE ai_routes
  ADD COLUMN IF NOT EXISTS configuration_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tested_revision integer;

ALTER TABLE ai_routes
  DROP CONSTRAINT IF EXISTS ai_routes_tested_revision_valid;

ALTER TABLE ai_routes
  ADD CONSTRAINT ai_routes_tested_revision_valid
  CHECK (tested_revision IS NULL OR tested_revision <= configuration_revision);

CREATE INDEX IF NOT EXISTS ai_routes_publish_readiness_idx
  ON ai_routes (status, configuration_revision, tested_revision)
  WHERE deleted_at IS NULL;
