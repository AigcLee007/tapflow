CREATE TABLE IF NOT EXISTS prompt_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  external_key text NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  description text NOT NULL DEFAULT '',
  prompt_text text NOT NULL CHECK (length(trim(prompt_text)) > 0),
  negative_prompt text,
  category text NOT NULL,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  sort_weight integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS prompt_entries_official_external_key_idx
  ON prompt_entries (external_key)
  WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS prompt_entries_published_category_idx
  ON prompt_entries (status, category, sort_weight DESC, updated_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS prompt_entries_tenant_status_idx
  ON prompt_entries (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS prompt_entry_media (
  prompt_id uuid NOT NULL REFERENCES prompt_entries(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  alt_text text NOT NULL DEFAULT '',
  PRIMARY KEY (prompt_id, asset_id)
);

CREATE INDEX IF NOT EXISTS prompt_entry_media_prompt_order_idx
  ON prompt_entry_media (prompt_id, sort_order, asset_id);

CREATE TABLE IF NOT EXISTS prompt_favorites (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt_id uuid NOT NULL REFERENCES prompt_entries(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, prompt_id)
);

CREATE INDEX IF NOT EXISTS prompt_favorites_tenant_user_created_idx
  ON prompt_favorites (tenant_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS prompt_favorites_tenant_prompt_idx
  ON prompt_favorites (tenant_id, prompt_id);

CREATE TABLE IF NOT EXISTS prompt_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt_id uuid NOT NULL REFERENCES prompt_entries(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('view', 'copy', 'reference')),
  project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prompt_interactions_tenant_prompt_created_idx
  ON prompt_interactions (tenant_id, prompt_id, created_at DESC);

CREATE INDEX IF NOT EXISTS prompt_interactions_tenant_user_created_idx
  ON prompt_interactions (tenant_id, user_id, created_at DESC);

INSERT INTO permissions (key, description)
VALUES
  ('prompt:read', 'Read published prompt plaza entries'),
  ('prompt:favorite', 'Favorite prompt plaza entries'),
  ('prompt:manage', 'Manage official prompt plaza entries')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key)
SELECT roles.id, permissions.key
FROM roles
CROSS JOIN permissions
WHERE roles.tenant_id IS NULL
  AND permissions.key IN ('prompt:read', 'prompt:favorite')
  AND roles.key IN ('system_admin', 'tenant_owner', 'tenant_admin', 'flow_developer', 'operator')
ON CONFLICT (role_id, permission_key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key)
SELECT roles.id, 'prompt:manage'
FROM roles
WHERE roles.tenant_id IS NULL
  AND roles.key IN ('system_admin', 'tenant_admin')
ON CONFLICT (role_id, permission_key) DO NOTHING;

ALTER TABLE prompt_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY prompt_entries_select_visible
  ON prompt_entries
  FOR SELECT
  USING (
    app.current_is_system_admin()
    OR (
      status = 'published'
      AND (tenant_id IS NULL OR tenant_id = app.current_tenant_id())
    )
  );

CREATE POLICY prompt_entries_insert_admin
  ON prompt_entries
  FOR INSERT
  WITH CHECK (app.current_is_system_admin() OR tenant_id = app.current_tenant_id());

CREATE POLICY prompt_entries_update_admin
  ON prompt_entries
  FOR UPDATE
  USING (app.current_is_system_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.current_is_system_admin() OR tenant_id = app.current_tenant_id());

CREATE POLICY prompt_entries_delete_admin
  ON prompt_entries
  FOR DELETE
  USING (app.current_is_system_admin() OR tenant_id = app.current_tenant_id());

ALTER TABLE prompt_entry_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_entry_media FORCE ROW LEVEL SECURITY;

CREATE POLICY prompt_entry_media_select_visible
  ON prompt_entry_media
  FOR SELECT
  USING (
    app.current_is_system_admin()
    OR EXISTS (
      SELECT 1
      FROM prompt_entries
      WHERE prompt_entries.id = prompt_entry_media.prompt_id
        AND prompt_entries.status = 'published'
        AND (prompt_entries.tenant_id IS NULL OR prompt_entries.tenant_id = app.current_tenant_id())
    )
  );

CREATE POLICY prompt_entry_media_write_admin
  ON prompt_entry_media
  FOR ALL
  USING (app.current_is_system_admin())
  WITH CHECK (app.current_is_system_admin());

ALTER TABLE prompt_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_favorites FORCE ROW LEVEL SECURITY;

CREATE POLICY prompt_favorites_current_user
  ON prompt_favorites
  FOR ALL
  USING (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id())
  WITH CHECK (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id());

ALTER TABLE prompt_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_interactions FORCE ROW LEVEL SECURITY;

CREATE POLICY prompt_interactions_current_user
  ON prompt_interactions
  FOR ALL
  USING (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id())
  WITH CHECK (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id());
