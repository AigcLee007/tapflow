CREATE TABLE IF NOT EXISTS agent_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  visibility text NOT NULL CHECK (visibility IN ('official', 'private')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  slug text NOT NULL,
  name text NOT NULL,
  summary text NOT NULL,
  modality text NOT NULL CHECK (modality IN ('text', 'image', 'video')),
  current_version_id uuid NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((visibility = 'official' AND tenant_id IS NULL) OR (visibility = 'private' AND tenant_id IS NOT NULL AND owner_user_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_skills_private_slug_unique
  ON agent_skills (tenant_id, slug) WHERE visibility = 'private';
CREATE UNIQUE INDEX IF NOT EXISTS agent_skills_official_slug_unique
  ON agent_skills (slug) WHERE visibility = 'official';
CREATE INDEX IF NOT EXISTS idx_agent_skills_visible_catalog
  ON agent_skills (tenant_id, visibility, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_skill_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES tenants(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES agent_skills(id) ON DELETE CASCADE,
  version_no integer NOT NULL CHECK (version_no > 0),
  source_json jsonb NOT NULL,
  source_markdown text NOT NULL DEFAULT '',
  frontmatter_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_json jsonb NOT NULL,
  graph_json jsonb NULL,
  package_object_key text NULL,
  source_checksum text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_agent_skill_versions_skill_created
  ON agent_skill_versions (skill_id, version_no DESC);

CREATE OR REPLACE FUNCTION prevent_published_skill_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'SKILL_PUBLISHED_VERSION_IMMUTABLE';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS agent_skill_versions_published_immutable ON agent_skill_versions;
CREATE TRIGGER agent_skill_versions_published_immutable
  BEFORE UPDATE OR DELETE ON agent_skill_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_published_skill_version_mutation();

ALTER TABLE agent_skills
  ADD CONSTRAINT agent_skills_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES agent_skill_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS agent_skill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NULL REFERENCES agent_sessions(id) ON DELETE SET NULL,
  turn_id uuid NULL REFERENCES agent_turns(id) ON DELETE SET NULL,
  project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL,
  flow_id uuid NULL REFERENCES flows(id) ON DELETE SET NULL,
  skill_version_id uuid NOT NULL REFERENCES agent_skill_versions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'waiting_for_input', 'planned', 'waiting_for_approval', 'running', 'reviewing', 'succeeded', 'partial_success', 'failed', 'cancelled')),
  approval_state text NOT NULL DEFAULT 'not_required' CHECK (approval_state IN ('not_required', 'pending', 'approved', 'rejected')),
  idempotency_key text NOT NULL,
  graph_revision bigint NULL CHECK (graph_revision IS NULL OR graph_revision >= 0),
  budget_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_skill_runs_tenant_session_created
  ON agent_skill_runs (tenant_id, session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_skill_step_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  skill_run_id uuid NOT NULL REFERENCES agent_skill_runs(id) ON DELETE CASCADE,
  step_index integer NOT NULL CHECK (step_index >= 0),
  action text NOT NULL CHECK (action IN ('analyze', 'canvas', 'text', 'image', 'video', 'review', 'deliver')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'waiting_for_approval', 'succeeded', 'failed', 'skipped', 'cancelled')),
  approval_state text NOT NULL DEFAULT 'not_required' CHECK (approval_state IN ('not_required', 'pending', 'approved', 'rejected')),
  tool_call_id uuid NULL REFERENCES agent_tool_calls(id) ON DELETE SET NULL,
  workflow_run_id uuid NULL REFERENCES workflow_runs(id) ON DELETE SET NULL,
  node_id text NULL,
  asset_id uuid NULL REFERENCES assets(id) ON DELETE SET NULL,
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_run_id, step_index)
);
CREATE INDEX IF NOT EXISTS idx_agent_skill_steps_tenant_run
  ON agent_skill_step_runs (tenant_id, skill_run_id, step_index);

CREATE TABLE IF NOT EXISTS agent_skill_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  skill_run_id uuid NOT NULL REFERENCES agent_skill_runs(id) ON DELETE CASCADE,
  seq bigint NOT NULL CHECK (seq > 0),
  event_type text NOT NULL,
  from_status text NULL,
  to_status text NOT NULL,
  skill_version_id uuid NOT NULL REFERENCES agent_skill_versions(id) ON DELETE RESTRICT,
  turn_id uuid NULL REFERENCES agent_turns(id) ON DELETE SET NULL,
  idempotency_key text NULL,
  graph_revision bigint NULL CHECK (graph_revision IS NULL OR graph_revision >= 0),
  redaction_version text NOT NULL DEFAULT 'v2',
  event_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_run_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_agent_skill_run_events_tenant_run
  ON agent_skill_run_events (tenant_id, skill_run_id, seq ASC);

ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_skills FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_skills_select_visible ON agent_skills;
CREATE POLICY agent_skills_select_visible ON agent_skills FOR SELECT USING (
  app.current_is_system_admin() OR
  (visibility = 'official' AND status = 'published' AND tenant_id IS NULL) OR
  (visibility = 'private' AND tenant_id = app.current_tenant_id() AND owner_user_id = NULLIF(app.current_user_id(), '')::uuid)
);
DROP POLICY IF EXISTS agent_skills_write_owner ON agent_skills;
CREATE POLICY agent_skills_write_owner ON agent_skills FOR ALL USING (
  app.current_is_system_admin() OR (visibility = 'private' AND tenant_id = app.current_tenant_id() AND owner_user_id = NULLIF(app.current_user_id(), '')::uuid)
) WITH CHECK (
  app.current_is_system_admin() OR (visibility = 'private' AND tenant_id = app.current_tenant_id() AND owner_user_id = NULLIF(app.current_user_id(), '')::uuid)
);

ALTER TABLE agent_skill_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_skill_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_skill_versions_select_visible ON agent_skill_versions FOR SELECT USING (
  app.current_is_system_admin() OR EXISTS (SELECT 1 FROM agent_skills skill WHERE skill.id = skill_id AND ((skill.visibility = 'official' AND skill.status = 'published' AND skill.tenant_id IS NULL) OR (skill.visibility = 'private' AND skill.tenant_id = app.current_tenant_id() AND skill.owner_user_id = NULLIF(app.current_user_id(), '')::uuid)))
);
CREATE POLICY agent_skill_versions_write_owner ON agent_skill_versions FOR ALL USING (app.current_is_system_admin() OR (tenant_id = app.current_tenant_id() AND created_by = NULLIF(app.current_user_id(), '')::uuid)) WITH CHECK (app.current_is_system_admin() OR (tenant_id = app.current_tenant_id() AND created_by = NULLIF(app.current_user_id(), '')::uuid));

ALTER TABLE agent_skill_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_skill_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_skill_runs_tenant ON agent_skill_runs FOR ALL USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
ALTER TABLE agent_skill_step_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_skill_step_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_skill_steps_tenant ON agent_skill_step_runs FOR ALL USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
ALTER TABLE agent_skill_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_skill_run_events FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_skill_run_events_tenant ON agent_skill_run_events FOR ALL USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
