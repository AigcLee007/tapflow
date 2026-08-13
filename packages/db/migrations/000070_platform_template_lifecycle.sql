-- Platform-owned flow template lifecycle and immutable published snapshots.

ALTER TABLE flow_templates
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS input_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS published_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS published_by uuid NULL REFERENCES users(id) ON DELETE SET NULL;

-- Existing official rows remain available; tenant/private rows are retained as archived
-- historical records and are no longer part of the platform template catalog.
UPDATE flow_templates
SET status = CASE WHEN visibility = 'official' AND tenant_id IS NULL THEN 'published' ELSE 'archived' END,
    published_at = CASE WHEN visibility = 'official' AND tenant_id IS NULL THEN COALESCE(updated_at, now()) ELSE NULL END
WHERE status = 'draft';

ALTER TABLE flow_templates
  DROP CONSTRAINT IF EXISTS flow_templates_status_check,
  ADD CONSTRAINT flow_templates_status_check
    CHECK (status IN ('draft', 'testing', 'published', 'archived')),
  DROP CONSTRAINT IF EXISTS flow_templates_published_timestamp_check,
  ADD CONSTRAINT flow_templates_published_timestamp_check
    CHECK (status <> 'published' OR published_at IS NOT NULL),
  DROP CONSTRAINT IF EXISTS flow_templates_platform_scope_check,
  ADD CONSTRAINT flow_templates_platform_scope_check
    CHECK (tenant_id IS NULL OR status = 'archived');

CREATE TABLE IF NOT EXISTS flow_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES flow_templates(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  graph_json jsonb NOT NULL,
  input_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  node_count integer NOT NULL DEFAULT 0 CHECK (node_count >= 0),
  estimated_credits numeric(12, 4) NULL CHECK (estimated_credits >= 0),
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

-- Preserve a stable snapshot for every pre-existing published official
-- template before its current version pointer becomes visible to users.
INSERT INTO flow_template_versions (
  template_id,
  version,
  graph_json,
  input_schema,
  node_count,
  estimated_credits,
  created_by,
  created_at
)
SELECT
  template.id,
  1,
  template.graph_json,
  template.input_schema,
  template.node_count,
  template.estimated_credits,
  template.created_by,
  template.published_at
FROM flow_templates AS template
WHERE template.tenant_id IS NULL
  AND template.visibility = 'official'
  AND template.status = 'published'
ON CONFLICT (template_id, version) DO NOTHING;

UPDATE flow_templates AS template
SET version = 1
WHERE template.tenant_id IS NULL
  AND template.visibility = 'official'
  AND template.status = 'published'
  AND EXISTS (
    SELECT 1
    FROM flow_template_versions AS snapshot
    WHERE snapshot.template_id = template.id
      AND snapshot.version = 1
  );

CREATE INDEX IF NOT EXISTS idx_flow_template_versions_template_version
  ON flow_template_versions (template_id, version DESC);

ALTER TABLE flow_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_template_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY flow_template_versions_select_published_official_or_admin
  ON flow_template_versions
  FOR SELECT
  USING (
    app.current_is_system_admin()
    OR EXISTS (
      SELECT 1
      FROM flow_templates AS template
      WHERE template.id = flow_template_versions.template_id
        AND template.tenant_id IS NULL
        AND template.visibility = 'official'
        AND template.status = 'published'
        AND template.version = flow_template_versions.version
    )
  );

CREATE POLICY flow_template_versions_insert_system_admin
  ON flow_template_versions
  FOR INSERT
  WITH CHECK (app.current_is_system_admin());

CREATE POLICY flow_template_versions_update_never
  ON flow_template_versions
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY flow_template_versions_delete_system_admin
  ON flow_template_versions
  FOR DELETE
  USING (app.current_is_system_admin());

CREATE INDEX IF NOT EXISTS idx_flow_templates_lifecycle_category_updated
  ON flow_templates (status, category, updated_at DESC);

ALTER TABLE flow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flow_templates_select_visible_scope ON flow_templates;
DROP POLICY IF EXISTS flow_templates_insert_visible_scope ON flow_templates;
DROP POLICY IF EXISTS flow_templates_update_visible_scope ON flow_templates;
DROP POLICY IF EXISTS flow_templates_delete_visible_scope ON flow_templates;

CREATE POLICY flow_templates_select_published_official_or_admin
  ON flow_templates
  FOR SELECT
  USING (
    app.current_is_system_admin()
    OR (tenant_id IS NULL AND visibility = 'official' AND status = 'published')
  );

CREATE POLICY flow_templates_insert_system_admin
  ON flow_templates
  FOR INSERT
  WITH CHECK (app.current_is_system_admin() AND tenant_id IS NULL);

CREATE POLICY flow_templates_update_system_admin
  ON flow_templates
  FOR UPDATE
  USING (app.current_is_system_admin() AND tenant_id IS NULL)
  WITH CHECK (app.current_is_system_admin() AND tenant_id IS NULL);

CREATE POLICY flow_templates_delete_system_admin
  ON flow_templates
  FOR DELETE
  USING (app.current_is_system_admin() AND tenant_id IS NULL);
