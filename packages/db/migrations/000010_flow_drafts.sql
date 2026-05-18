CREATE TABLE IF NOT EXISTS flow_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  graph_json jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb,
  revision int NOT NULL DEFAULT 1,
  last_saved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id)
);

CREATE INDEX IF NOT EXISTS flow_drafts_tenant_project_idx
  ON flow_drafts (tenant_id, project_id);

CREATE INDEX IF NOT EXISTS flow_drafts_tenant_flow_idx
  ON flow_drafts (tenant_id, flow_id);

CREATE INDEX IF NOT EXISTS flow_drafts_graph_json_gin_idx
  ON flow_drafts
  USING gin (graph_json);

ALTER TABLE flow_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_drafts FORCE ROW LEVEL SECURITY;

CREATE POLICY flow_drafts_select_current_tenant
  ON flow_drafts
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY flow_drafts_insert_current_tenant
  ON flow_drafts
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY flow_drafts_update_current_tenant
  ON flow_drafts
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY flow_drafts_delete_current_tenant
  ON flow_drafts
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());
