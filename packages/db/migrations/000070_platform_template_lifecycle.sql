-- Platform-owned flow template lifecycle and immutable version identity.

ALTER TABLE flow_templates
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version_id uuid NOT NULL DEFAULT gen_random_uuid(),
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

CREATE UNIQUE INDEX IF NOT EXISTS flow_templates_version_identity_idx
  ON flow_templates (id, version_id);

CREATE OR REPLACE FUNCTION app.prevent_flow_template_version_identity_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version_id IS DISTINCT FROM OLD.version_id THEN
    RAISE EXCEPTION 'flow template version_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS flow_templates_version_identity_immutable ON flow_templates;
CREATE TRIGGER flow_templates_version_identity_immutable
  BEFORE UPDATE ON flow_templates
  FOR EACH ROW
  EXECUTE FUNCTION app.prevent_flow_template_version_identity_change();

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
