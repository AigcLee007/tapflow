CREATE INDEX IF NOT EXISTS assets_tenant_kind_updated_available_idx
  ON assets (tenant_id, kind, updated_at DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND status = 'available';

CREATE INDEX IF NOT EXISTS assets_tenant_updated_available_idx
  ON assets (tenant_id, updated_at DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND status = 'available';

CREATE INDEX IF NOT EXISTS assets_tenant_favorite_updated_available_idx
  ON assets (tenant_id, favorite, updated_at DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND status = 'available';

CREATE INDEX IF NOT EXISTS asset_variants_tenant_asset_variant_idx
  ON asset_variants (tenant_id, asset_id, variant_key);

CREATE INDEX IF NOT EXISTS projects_tenant_updated_active_idx
  ON projects (tenant_id, updated_at DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
