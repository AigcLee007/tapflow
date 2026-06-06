CREATE TABLE IF NOT EXISTS ai_plugin_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  provider_key text NOT NULL,
  adapter_kind text NOT NULL,
  modality text NOT NULL,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  manifest_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_plugin_packages_modality_status_idx
  ON ai_plugin_packages (modality, status);

CREATE TABLE IF NOT EXISTS tenant_ai_plugin_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  package_id uuid NOT NULL REFERENCES ai_plugin_packages(id),
  installed_version text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  provider_id uuid REFERENCES ai_providers(id),
  credential_id uuid REFERENCES api_credentials(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  installed_by uuid REFERENCES users(id),
  published_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, package_id)
);

CREATE INDEX IF NOT EXISTS tenant_ai_plugin_installs_tenant_status_idx
  ON tenant_ai_plugin_installs (tenant_id, status);

CREATE TABLE IF NOT EXISTS ai_model_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  plugin_install_id uuid REFERENCES tenant_ai_plugin_installs(id),
  model_id uuid REFERENCES ai_models(id),
  model_key text NOT NULL,
  display_name text NOT NULL,
  modality text NOT NULL,
  model_family text NOT NULL,
  default_route_key text,
  ui_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order int NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_model_catalog_tenant_modality_idx
  ON ai_model_catalog (tenant_id, modality, status, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS ai_model_catalog_tenant_model_key_unique_idx
  ON ai_model_catalog (tenant_id, model_key)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_model_catalog_system_model_key_unique_idx
  ON ai_model_catalog (model_key)
  WHERE tenant_id IS NULL;

CREATE TABLE IF NOT EXISTS ai_route_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  route_id uuid NOT NULL REFERENCES ai_routes(id),
  status text NOT NULL,
  latency_ms int,
  request_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error jsonb,
  checked_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_route_health_checks_route_created_idx
  ON ai_route_health_checks (tenant_id, route_id, created_at DESC);

ALTER TABLE ai_routes
  ADD COLUMN IF NOT EXISTS plugin_install_id uuid REFERENCES tenant_ai_plugin_installs(id),
  ADD COLUMN IF NOT EXISTS model_family text,
  ADD COLUMN IF NOT EXISTS route_label text,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production';

CREATE INDEX IF NOT EXISTS ai_routes_tenant_model_family_idx
  ON ai_routes (tenant_id, modality, model_family, status);

CREATE INDEX IF NOT EXISTS ai_routes_plugin_install_idx
  ON ai_routes (plugin_install_id)
  WHERE plugin_install_id IS NOT NULL;

ALTER TABLE tenant_ai_plugin_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_ai_plugin_installs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_ai_plugin_installs_select_current_tenant
  ON tenant_ai_plugin_installs
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY tenant_ai_plugin_installs_insert_current_tenant
  ON tenant_ai_plugin_installs
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY tenant_ai_plugin_installs_update_current_tenant
  ON tenant_ai_plugin_installs
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY tenant_ai_plugin_installs_delete_current_tenant
  ON tenant_ai_plugin_installs
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

ALTER TABLE ai_model_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_model_catalog FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_model_catalog_select_visible_models
  ON ai_model_catalog
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

CREATE POLICY ai_model_catalog_insert_current_tenant
  ON ai_model_catalog
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY ai_model_catalog_update_current_tenant
  ON ai_model_catalog
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY ai_model_catalog_delete_current_tenant
  ON ai_model_catalog
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

ALTER TABLE ai_route_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_route_health_checks FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_route_health_checks_select_current_tenant
  ON ai_route_health_checks
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY ai_route_health_checks_insert_current_tenant
  ON ai_route_health_checks
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY ai_route_health_checks_update_current_tenant
  ON ai_route_health_checks
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY ai_route_health_checks_delete_current_tenant
  ON ai_route_health_checks
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());
