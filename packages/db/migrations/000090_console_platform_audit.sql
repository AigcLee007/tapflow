-- Platform role changes have no tenant by design. Super administrators may
-- read this immutable trail; operators retain the limited operational audit.
CREATE POLICY platform_role_audit_super_read ON platform_role_audit FOR SELECT
  USING (app.platform_scope_allows(ARRAY['platform:audit:read']) AND app.current_platform_role()='platform_super_admin');
DO $$
DECLARE runtime_role name := COALESCE(NULLIF(current_setting('app.api_database_role', true), ''), session_user);
BEGIN
  EXECUTE format('GRANT SELECT ON platform_role_audit TO %I', runtime_role);
END $$;
CREATE INDEX idx_audit_logs_platform_created ON audit_logs(created_at DESC,id DESC);

-- INSERT ... RETURNING also evaluates SELECT policies. Platform mutations
-- may have no current tenant, or may audit an object in another tenant.
CREATE POLICY audit_logs_platform_mutation_returning ON audit_logs FOR SELECT USING (
  actor_user_id = app.current_user_id()
  AND app.platform_scope_allows(ARRAY[
    'platform:users:operate', 'platform:roles:manage', 'platform:billing:adjust',
    'platform:billing:manage', 'platform:routes:write', 'platform:connections:manage',
    'platform:integrations:manage', 'platform:pricing:publish', 'platform:content:manage',
    'platform:redeem:operate'
  ])
);
