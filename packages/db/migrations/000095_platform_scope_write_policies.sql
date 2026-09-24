-- Operator write policies must require the matching platform scope. A role
-- assignment alone must not turn an ordinary tenant transaction into a
-- platform route/catalog mutation.
DROP POLICY IF EXISTS ai_routes_operator_update ON ai_routes;
CREATE POLICY ai_routes_operator_update ON ai_routes FOR UPDATE
  USING (app.platform_scope_allows(ARRAY['platform:routes:write']))
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:routes:write']));

DROP POLICY IF EXISTS ai_model_catalog_operator_default ON ai_model_catalog;
CREATE POLICY ai_model_catalog_operator_default ON ai_model_catalog FOR UPDATE
  USING (app.platform_scope_allows(ARRAY['platform:routes:write']))
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:routes:write']));

-- User detail pages are platform-scoped reads; they must include memberships
-- from every tenant without granting operators role-management writes.
CREATE POLICY tenant_memberships_platform_users_read ON tenant_memberships FOR SELECT
  USING (app.platform_scope_allows(ARRAY['platform:users:read']));
