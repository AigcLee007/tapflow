ALTER TABLE ai_provider_connections
  ALTER COLUMN tenant_id DROP NOT NULL;

ALTER TABLE tenant_ai_plugin_installs
  ALTER COLUMN tenant_id DROP NOT NULL;

DROP INDEX IF EXISTS ai_provider_connections_tenant_name_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS ai_provider_connections_tenant_name_unique_idx
  ON ai_provider_connections (tenant_id, name)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_provider_connections_system_name_unique_idx
  ON ai_provider_connections (name)
  WHERE tenant_id IS NULL;

DROP INDEX IF EXISTS tenant_ai_plugin_installs_tenant_package_key;
DROP INDEX IF EXISTS tenant_ai_plugin_installs_system_package_key;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_ai_plugin_installs_system_package_unique_idx
  ON tenant_ai_plugin_installs (package_id)
  WHERE tenant_id IS NULL;

DROP POLICY IF EXISTS api_credentials_select_current_tenant ON api_credentials;
CREATE POLICY api_credentials_select_visible_credentials
  ON api_credentials
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS api_credentials_insert_current_tenant ON api_credentials;
CREATE POLICY api_credentials_insert_visible_scope
  ON api_credentials
  FOR INSERT
  WITH CHECK (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS api_credentials_update_current_tenant ON api_credentials;
CREATE POLICY api_credentials_update_visible_scope
  ON api_credentials
  FOR UPDATE
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS api_credentials_delete_current_tenant ON api_credentials;
CREATE POLICY api_credentials_delete_visible_scope
  ON api_credentials
  FOR DELETE
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS ai_routes_insert_current_tenant ON ai_routes;
CREATE POLICY ai_routes_insert_visible_scope
  ON ai_routes
  FOR INSERT
  WITH CHECK (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS ai_routes_update_current_tenant ON ai_routes;
CREATE POLICY ai_routes_update_visible_scope
  ON ai_routes
  FOR UPDATE
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS ai_routes_delete_current_tenant ON ai_routes;
CREATE POLICY ai_routes_delete_visible_scope
  ON ai_routes
  FOR DELETE
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS ai_model_catalog_insert_current_tenant ON ai_model_catalog;
CREATE POLICY ai_model_catalog_insert_visible_scope
  ON ai_model_catalog
  FOR INSERT
  WITH CHECK (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS ai_model_catalog_update_current_tenant ON ai_model_catalog;
CREATE POLICY ai_model_catalog_update_visible_scope
  ON ai_model_catalog
  FOR UPDATE
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS ai_model_catalog_delete_current_tenant ON ai_model_catalog;
CREATE POLICY ai_model_catalog_delete_visible_scope
  ON ai_model_catalog
  FOR DELETE
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS ai_provider_connections_select_current_tenant ON ai_provider_connections;
CREATE POLICY ai_provider_connections_select_visible_connections
  ON ai_provider_connections
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS ai_provider_connections_insert_current_tenant ON ai_provider_connections;
CREATE POLICY ai_provider_connections_insert_visible_scope
  ON ai_provider_connections
  FOR INSERT
  WITH CHECK (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS ai_provider_connections_update_current_tenant ON ai_provider_connections;
CREATE POLICY ai_provider_connections_update_visible_scope
  ON ai_provider_connections
  FOR UPDATE
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS ai_provider_connections_delete_current_tenant ON ai_provider_connections;
CREATE POLICY ai_provider_connections_delete_visible_scope
  ON ai_provider_connections
  FOR DELETE
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS tenant_ai_plugin_installs_select_current_tenant ON tenant_ai_plugin_installs;
CREATE POLICY tenant_ai_plugin_installs_select_visible_installs
  ON tenant_ai_plugin_installs
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS tenant_ai_plugin_installs_insert_current_tenant ON tenant_ai_plugin_installs;
CREATE POLICY tenant_ai_plugin_installs_insert_visible_scope
  ON tenant_ai_plugin_installs
  FOR INSERT
  WITH CHECK (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS tenant_ai_plugin_installs_update_current_tenant ON tenant_ai_plugin_installs;
CREATE POLICY tenant_ai_plugin_installs_update_visible_scope
  ON tenant_ai_plugin_installs
  FOR UPDATE
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS tenant_ai_plugin_installs_delete_current_tenant ON tenant_ai_plugin_installs;
CREATE POLICY tenant_ai_plugin_installs_delete_visible_scope
  ON tenant_ai_plugin_installs
  FOR DELETE
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

WITH provider_permissions AS (
  SELECT permission_key
  FROM (VALUES
    ('provider:read'),
    ('provider:manage'),
    ('credential:manage')
  ) AS permissions(permission_key)
)
DELETE FROM role_permissions AS role_permission
USING roles AS role, provider_permissions
WHERE role_permission.role_id = role.id
  AND role.tenant_id IS NULL
  AND role.key IN ('tenant_owner', 'tenant_admin', 'flow_developer')
  AND role_permission.permission_key = provider_permissions.permission_key;
