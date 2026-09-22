-- Global AI configuration writes must run inside an explicitly scoped
-- platform transaction. Role checks alone are insufficient because a reused
-- connection can otherwise retain authority outside the intended operation.

DROP POLICY IF EXISTS api_credentials_platform_insert ON api_credentials;
DROP POLICY IF EXISTS api_credentials_platform_update ON api_credentials;
DROP POLICY IF EXISTS api_credentials_platform_delete ON api_credentials;
CREATE POLICY api_credentials_platform_insert ON api_credentials FOR INSERT
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']));
CREATE POLICY api_credentials_platform_update ON api_credentials FOR UPDATE
  USING (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']))
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']));
CREATE POLICY api_credentials_platform_delete ON api_credentials FOR DELETE
  USING (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']));

DROP POLICY IF EXISTS ai_provider_connections_platform_insert ON ai_provider_connections;
DROP POLICY IF EXISTS ai_provider_connections_platform_update ON ai_provider_connections;
DROP POLICY IF EXISTS ai_provider_connections_platform_delete ON ai_provider_connections;
CREATE POLICY ai_provider_connections_platform_insert ON ai_provider_connections FOR INSERT
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']));
CREATE POLICY ai_provider_connections_platform_update ON ai_provider_connections FOR UPDATE
  USING (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']))
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']));
CREATE POLICY ai_provider_connections_platform_delete ON ai_provider_connections FOR DELETE
  USING (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']));

DROP POLICY IF EXISTS tenant_ai_plugin_installs_platform_insert ON tenant_ai_plugin_installs;
DROP POLICY IF EXISTS tenant_ai_plugin_installs_platform_update ON tenant_ai_plugin_installs;
DROP POLICY IF EXISTS tenant_ai_plugin_installs_platform_delete ON tenant_ai_plugin_installs;
CREATE POLICY tenant_ai_plugin_installs_platform_insert ON tenant_ai_plugin_installs FOR INSERT
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']));
CREATE POLICY tenant_ai_plugin_installs_platform_update ON tenant_ai_plugin_installs FOR UPDATE
  USING (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']))
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']));
CREATE POLICY tenant_ai_plugin_installs_platform_delete ON tenant_ai_plugin_installs FOR DELETE
  USING (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']));

DROP POLICY IF EXISTS ai_routes_platform_insert ON ai_routes;
DROP POLICY IF EXISTS ai_routes_platform_update ON ai_routes;
DROP POLICY IF EXISTS ai_routes_platform_delete ON ai_routes;
CREATE POLICY ai_routes_platform_insert ON ai_routes FOR INSERT
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:routes:write','platform:pricing:publish']));
CREATE POLICY ai_routes_platform_update ON ai_routes FOR UPDATE
  USING (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:routes:write','platform:pricing:publish']))
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:routes:write','platform:pricing:publish']));
CREATE POLICY ai_routes_platform_delete ON ai_routes FOR DELETE
  USING (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:routes:write','platform:pricing:publish']));

DROP POLICY IF EXISTS ai_model_catalog_platform_insert ON ai_model_catalog;
DROP POLICY IF EXISTS ai_model_catalog_platform_update ON ai_model_catalog;
DROP POLICY IF EXISTS ai_model_catalog_platform_delete ON ai_model_catalog;
CREATE POLICY ai_model_catalog_platform_insert ON ai_model_catalog FOR INSERT
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:routes:write','platform:pricing:publish']));
CREATE POLICY ai_model_catalog_platform_update ON ai_model_catalog FOR UPDATE
  USING (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:routes:write','platform:pricing:publish']))
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:routes:write','platform:pricing:publish']));
CREATE POLICY ai_model_catalog_platform_delete ON ai_model_catalog FOR DELETE
  USING (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:routes:write','platform:pricing:publish']));

DROP POLICY IF EXISTS ai_providers_platform_insert ON ai_providers;
DROP POLICY IF EXISTS ai_providers_platform_update ON ai_providers;
DROP POLICY IF EXISTS ai_providers_platform_delete ON ai_providers;
CREATE POLICY ai_providers_platform_insert ON ai_providers FOR INSERT
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']));
CREATE POLICY ai_providers_platform_update ON ai_providers FOR UPDATE
  USING (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']))
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']));
CREATE POLICY ai_providers_platform_delete ON ai_providers FOR DELETE
  USING (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']));

DROP POLICY IF EXISTS ai_models_platform_insert ON ai_models;
DROP POLICY IF EXISTS ai_models_platform_update ON ai_models;
DROP POLICY IF EXISTS ai_models_platform_delete ON ai_models;
CREATE POLICY ai_models_platform_insert ON ai_models FOR INSERT
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']));
CREATE POLICY ai_models_platform_update ON ai_models FOR UPDATE
  USING (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']))
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']));
CREATE POLICY ai_models_platform_delete ON ai_models FOR DELETE
  USING (app.platform_scope_allows(ARRAY['platform:connections:manage','platform:pricing:publish']));

DROP POLICY IF EXISTS model_pricing_platform_insert ON model_pricing;
DROP POLICY IF EXISTS model_pricing_platform_update ON model_pricing;
DROP POLICY IF EXISTS model_pricing_platform_delete ON model_pricing;
CREATE POLICY model_pricing_platform_insert ON model_pricing FOR INSERT
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:pricing:publish']));
CREATE POLICY model_pricing_platform_update ON model_pricing FOR UPDATE
  USING (app.platform_scope_allows(ARRAY['platform:pricing:publish']))
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:pricing:publish']));
CREATE POLICY model_pricing_platform_delete ON model_pricing FOR DELETE
  USING (app.platform_scope_allows(ARRAY['platform:pricing:publish']));

-- The configuration workflow reads every global reference while using the
-- pricing scope. Extend the inspection policies to that explicit scope.
DROP POLICY IF EXISTS api_credentials_platform_inspect ON api_credentials;
CREATE POLICY api_credentials_platform_inspect ON api_credentials FOR SELECT
  USING (app.platform_scope_allows(ARRAY['platform:connections:read','platform:connections:manage','platform:routes:write','platform:pricing:publish']));
DROP POLICY IF EXISTS ai_provider_connections_platform_inspect ON ai_provider_connections;
CREATE POLICY ai_provider_connections_platform_inspect ON ai_provider_connections FOR SELECT
  USING (app.platform_scope_allows(ARRAY['platform:connections:read','platform:connections:manage','platform:routes:write','platform:pricing:publish']));
DROP POLICY IF EXISTS ai_routes_platform_inspect ON ai_routes;
CREATE POLICY ai_routes_platform_inspect ON ai_routes FOR SELECT
  USING (app.platform_scope_allows(ARRAY['platform:models:read','platform:routes:read','platform:routes:write','platform:connections:manage','platform:pricing:publish']));
DROP POLICY IF EXISTS ai_model_catalog_platform_inspect ON ai_model_catalog;
CREATE POLICY ai_model_catalog_platform_inspect ON ai_model_catalog FOR SELECT
  USING (app.platform_scope_allows(ARRAY['platform:models:read','platform:routes:read','platform:routes:write','platform:connections:manage','platform:pricing:publish']));
DROP POLICY IF EXISTS tenant_ai_plugin_installs_platform_inspect ON tenant_ai_plugin_installs;
CREATE POLICY tenant_ai_plugin_installs_platform_inspect ON tenant_ai_plugin_installs FOR SELECT
  USING (app.platform_scope_allows(ARRAY['platform:models:read','platform:routes:read','platform:routes:write','platform:connections:manage','platform:pricing:publish']));
