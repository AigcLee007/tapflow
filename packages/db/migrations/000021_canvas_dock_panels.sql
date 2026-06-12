CREATE TABLE IF NOT EXISTS flow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  visibility text NOT NULL CHECK (visibility IN ('official', 'tenant', 'private')),
  cover_asset_id uuid NULL REFERENCES assets(id) ON DELETE SET NULL,
  graph_json jsonb NOT NULL,
  node_count integer NOT NULL DEFAULT 0,
  estimated_credits numeric(12, 4) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flow_templates_tenant_visibility
  ON flow_templates(tenant_id, visibility, category, updated_at DESC);

CREATE TABLE IF NOT EXISTS flow_template_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES flow_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flow_template_usage_tenant_user
  ON flow_template_usage(tenant_id, user_id, created_at DESC);

ALTER TABLE flow_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY flow_templates_select_visible_scope
  ON flow_templates
  FOR SELECT
  USING (visibility = 'official' OR tenant_id = app.current_tenant_id());

CREATE POLICY flow_templates_insert_visible_scope
  ON flow_templates
  FOR INSERT
  WITH CHECK (
    (visibility = 'official' AND tenant_id IS NULL)
    OR tenant_id = app.current_tenant_id()
  );

CREATE POLICY flow_templates_update_visible_scope
  ON flow_templates
  FOR UPDATE
  USING (visibility = 'official' OR tenant_id = app.current_tenant_id())
  WITH CHECK (
    (visibility = 'official' AND tenant_id IS NULL)
    OR tenant_id = app.current_tenant_id()
  );

CREATE POLICY flow_templates_delete_visible_scope
  ON flow_templates
  FOR DELETE
  USING (visibility = 'official' OR tenant_id = app.current_tenant_id());

ALTER TABLE flow_template_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY flow_template_usage_select_current_tenant
  ON flow_template_usage
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY flow_template_usage_insert_current_tenant
  ON flow_template_usage
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY flow_template_usage_update_current_tenant
  ON flow_template_usage
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY flow_template_usage_delete_current_tenant
  ON flow_template_usage
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE TABLE IF NOT EXISTS flow_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  flow_id uuid NULL REFERENCES flows(id) ON DELETE CASCADE,
  node_id text NULL,
  author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  anchor_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flow_comments_project_status
  ON flow_comments(tenant_id, project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_flow_comments_node
  ON flow_comments(tenant_id, project_id, node_id, created_at DESC);

ALTER TABLE flow_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY flow_comments_select_current_tenant
  ON flow_comments
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY flow_comments_insert_current_tenant
  ON flow_comments
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY flow_comments_update_current_tenant
  ON flow_comments
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY flow_comments_delete_current_tenant
  ON flow_comments
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE TABLE IF NOT EXISTS flow_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  flow_version_id uuid NULL REFERENCES flow_versions(id) ON DELETE SET NULL,
  actor_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('snapshot', 'restore')),
  label text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  payload_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flow_activity_events_project_created
  ON flow_activity_events(tenant_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_flow_activity_events_flow_created
  ON flow_activity_events(tenant_id, flow_id, created_at DESC);

ALTER TABLE flow_activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY flow_activity_events_select_current_tenant
  ON flow_activity_events
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY flow_activity_events_insert_current_tenant
  ON flow_activity_events
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY flow_activity_events_update_current_tenant
  ON flow_activity_events
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY flow_activity_events_delete_current_tenant
  ON flow_activity_events
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());
