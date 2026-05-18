ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS cover_asset_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assets_tenant_id_unique'
  ) THEN
    ALTER TABLE assets
      ADD CONSTRAINT assets_tenant_id_unique UNIQUE (tenant_id, id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_cover_asset_same_tenant_fkey'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_cover_asset_same_tenant_fkey
      FOREIGN KEY (tenant_id, cover_asset_id)
      REFERENCES assets(tenant_id, id);
  END IF;
END $$;

INSERT INTO permissions (key, description)
VALUES ('asset:update', 'Update asset metadata and folders')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key)
SELECT roles.id, 'asset:update'
FROM roles
WHERE roles.key IN ('system_admin', 'tenant_owner', 'tenant_admin', 'flow_developer', 'operator')
ON CONFLICT (role_id, permission_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS asset_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  parent_folder_id uuid REFERENCES asset_folders(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, parent_folder_id, name)
);

CREATE TABLE IF NOT EXISTS asset_folder_items (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  folder_id uuid NOT NULL REFERENCES asset_folders(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  added_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, asset_id)
);

CREATE INDEX IF NOT EXISTS assets_tenant_kind_idx
  ON assets (tenant_id, kind);

CREATE INDEX IF NOT EXISTS assets_tenant_source_idx
  ON assets (tenant_id, source);

CREATE INDEX IF NOT EXISTS assets_tenant_favorite_idx
  ON assets (tenant_id, favorite);

CREATE INDEX IF NOT EXISTS assets_tenant_tags_gin_idx
  ON assets USING gin (tags);

CREATE INDEX IF NOT EXISTS projects_tenant_cover_asset_idx
  ON projects (tenant_id, cover_asset_id);

CREATE INDEX IF NOT EXISTS asset_folders_tenant_parent_idx
  ON asset_folders (tenant_id, parent_folder_id, deleted_at);

CREATE INDEX IF NOT EXISTS asset_folder_items_tenant_asset_idx
  ON asset_folder_items (tenant_id, asset_id);

ALTER TABLE asset_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_folders FORCE ROW LEVEL SECURITY;

CREATE POLICY asset_folders_select_current_tenant
  ON asset_folders
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY asset_folders_insert_current_tenant
  ON asset_folders
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY asset_folders_update_current_tenant
  ON asset_folders
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY asset_folders_delete_current_tenant
  ON asset_folders
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

ALTER TABLE asset_folder_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_folder_items FORCE ROW LEVEL SECURITY;

CREATE POLICY asset_folder_items_select_current_tenant
  ON asset_folder_items
  FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM asset_folders
      WHERE asset_folders.id = asset_folder_items.folder_id
        AND asset_folders.tenant_id = app.current_tenant_id()
    )
    AND EXISTS (
      SELECT 1 FROM assets
      WHERE assets.id = asset_folder_items.asset_id
        AND assets.tenant_id = app.current_tenant_id()
    )
  );

CREATE POLICY asset_folder_items_insert_current_tenant
  ON asset_folder_items
  FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM asset_folders
      WHERE asset_folders.id = asset_folder_items.folder_id
        AND asset_folders.tenant_id = app.current_tenant_id()
    )
    AND EXISTS (
      SELECT 1 FROM assets
      WHERE assets.id = asset_folder_items.asset_id
        AND assets.tenant_id = app.current_tenant_id()
    )
  );

CREATE POLICY asset_folder_items_update_current_tenant
  ON asset_folder_items
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM asset_folders
      WHERE asset_folders.id = asset_folder_items.folder_id
        AND asset_folders.tenant_id = app.current_tenant_id()
    )
    AND EXISTS (
      SELECT 1 FROM assets
      WHERE assets.id = asset_folder_items.asset_id
        AND assets.tenant_id = app.current_tenant_id()
    )
  );

CREATE POLICY asset_folder_items_delete_current_tenant
  ON asset_folder_items
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());
