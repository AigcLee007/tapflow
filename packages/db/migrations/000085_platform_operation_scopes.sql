-- Operators use explicitly scoped transactions, never app.is_system_admin.
CREATE FUNCTION app.platform_scope_allows(p_scopes text[])
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public, app AS $$
  SELECT COALESCE(
    current_setting('app.platform_scope', true) = ANY(p_scopes)
    AND (app.current_platform_role() = 'platform_super_admin'
      OR (app.current_platform_role() = 'platform_operator'
        AND current_setting('app.platform_scope', true) = ANY(ARRAY[
          'platform:console:access', 'platform:users:read', 'platform:users:operate',
          'platform:usage:read', 'platform:tasks:read', 'platform:connections:read',
          'platform:models:read', 'platform:routes:read', 'platform:routes:write',
          'platform:content:manage', 'platform:payments:read', 'platform:redeem:operate', 'platform:audit:read'
        ]))), false)
$$;

-- Tenant-derived legacy platform authority is explicitly retired.
DELETE FROM role_permissions WHERE permission_key IN (
  'admin:system', 'provider:read', 'provider:manage', 'credential:manage',
  'billing:plans:manage', 'billing:payments:manage', 'billing:refund'
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenants', 'tenant_memberships', 'billing_accounts', 'billing_wallets',
    'billing_wallet_credit_grants', 'billing_wallet_ledger', 'billing_wallet_credit_reservations', 'usage_events'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app.platform_scope_allows(ARRAY[%L,%L,%L,%L,%L]))',
      t || '_platform_read', t, 'platform:users:read', 'platform:usage:read', 'platform:console:access', 'platform:billing:adjust', 'platform:payments:read');
  END LOOP;
  FOREACH t IN ARRAY ARRAY['workflow_runs', 'node_runs', 'ai_call_logs'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app.platform_scope_allows(ARRAY[%L,%L,%L,%L]))',
      t || '_platform_read', t, 'platform:tasks:read', 'platform:usage:read', 'platform:routes:read', 'platform:console:access');
  END LOOP;
  FOREACH t IN ARRAY ARRAY['billing_wallet_payments', 'billing_recharge_plans'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app.platform_scope_allows(ARRAY[%L,%L]))',
      t || '_platform_read', t, 'platform:payments:read', 'platform:console:access');
  END LOOP;
  FOREACH t IN ARRAY ARRAY['billing_redeem_codes', 'billing_redeem_code_redemptions'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app.platform_scope_allows(ARRAY[%L]))',
      t || '_platform_read', t, 'platform:redeem:operate');
  END LOOP;
  FOREACH t IN ARRAY ARRAY['prompt_entries', 'prompt_entry_media', 'flow_templates', 'flow_template_versions', 'announcements'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app.platform_scope_allows(ARRAY[%L]))', t || '_platform_content_read', t, 'platform:content:manage');
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (app.platform_scope_allows(ARRAY[%L]))', t || '_platform_content_insert', t, 'platform:content:manage');
    -- Published template versions are immutable.
    IF t <> 'flow_template_versions' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (app.platform_scope_allows(ARRAY[%L])) WITH CHECK (app.platform_scope_allows(ARRAY[%L]))',
        t || '_platform_content_update', t, 'platform:content:manage', 'platform:content:manage');
    END IF;
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (app.platform_scope_allows(ARRAY[%L]))', t || '_platform_content_delete', t, 'platform:content:manage');
  END LOOP;
END $$;

CREATE POLICY audit_logs_platform_insert ON audit_logs FOR INSERT WITH CHECK (
  actor_user_id = app.current_user_id() AND app.current_platform_role() IN ('platform_operator', 'platform_super_admin')
);
CREATE POLICY audit_logs_platform_read ON audit_logs FOR SELECT USING (
  app.platform_scope_allows(ARRAY['platform:audit:read'])
  AND (app.current_platform_role() = 'platform_super_admin' OR action = ANY(ARRAY[
    'admin.user.update_status', 'admin.announcement.create', 'admin.announcement.update', 'admin.announcement.delete',
    'ai.route.update', 'ai.route.operate', 'ai.route.set_default', 'ai.route.test'
  ]))
);

-- Replace the permissive writes from migration 20. Adding policies alone would
-- leave tenant_id IS NULL OR current_tenant policies effective via OR.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['api_credentials', 'ai_provider_connections', 'tenant_ai_plugin_installs', 'ai_model_catalog', 'ai_routes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert_visible_scope', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update_visible_scope', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete_visible_scope', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (app.current_platform_role() = %L)', t || '_platform_insert', t, 'platform_super_admin');
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (app.current_platform_role() = %L) WITH CHECK (app.current_platform_role() = %L)',
      t || '_platform_update', t, 'platform_super_admin', 'platform_super_admin');
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (app.current_platform_role() = %L)', t || '_platform_delete', t, 'platform_super_admin');
  END LOOP;
END $$;

-- These global reference tables previously had no row policies. Reads remain
-- available to the runtime; only explicitly authorized platform owners write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_providers', 'ai_models', 'model_pricing'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', t || '_runtime_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (app.current_platform_role() = %L)', t || '_platform_insert', t, 'platform_super_admin');
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (app.current_platform_role() = %L) WITH CHECK (app.current_platform_role() = %L)', t || '_platform_update', t, 'platform_super_admin', 'platform_super_admin');
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (app.current_platform_role() = %L)', t || '_platform_delete', t, 'platform_super_admin');
  END LOOP;
END $$;
CREATE POLICY ai_routes_operator_update ON ai_routes FOR UPDATE
  USING (app.current_platform_role() = 'platform_operator')
  WITH CHECK (app.current_platform_role() = 'platform_operator');

-- Gateway console inspection is platform-wide only inside an authorized scope.
-- Creator/runtime transactions retain their existing tenant visibility.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['api_credentials', 'ai_provider_connections'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app.platform_scope_allows(ARRAY[%L,%L,%L]))',
      t || '_platform_inspect', t, 'platform:connections:read', 'platform:connections:manage', 'platform:routes:write');
  END LOOP;
  FOREACH t IN ARRAY ARRAY['ai_routes', 'ai_model_catalog', 'tenant_ai_plugin_installs'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app.platform_scope_allows(ARRAY[%L,%L,%L,%L]))',
      t || '_platform_inspect', t, 'platform:models:read', 'platform:routes:read', 'platform:routes:write', 'platform:connections:manage');
  END LOOP;
END $$;

-- RLS controls rows; this trigger additionally controls which route fields an
-- operator may mutate. Gateway configuration/install paths stay super-only.
CREATE FUNCTION app.guard_operator_route_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, app AS $$
DECLARE allowed text[] := ARRAY['route_label','status','priority','weight','is_default','updated_at'];
BEGIN
  IF current_setting('app.platform_route_test', true) = 'true' THEN
    allowed := ARRAY['tested_revision','health_status','last_health_checked_at','updated_at'];
  END IF;
  IF app.current_platform_role() = 'platform_operator'
    AND (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'PLATFORM_ROUTE_FIELDS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_routes_operator_field_guard BEFORE UPDATE ON ai_routes
  FOR EACH ROW EXECUTE FUNCTION app.guard_operator_route_fields();

CREATE POLICY ai_model_catalog_operator_default ON ai_model_catalog FOR UPDATE
  USING (app.current_platform_role() = 'platform_operator')
  WITH CHECK (app.current_platform_role() = 'platform_operator');
CREATE FUNCTION app.guard_operator_catalog_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF app.current_platform_role() = 'platform_operator'
    AND (to_jsonb(NEW) - ARRAY['default_route_key','updated_at'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['default_route_key','updated_at']) THEN
    RAISE EXCEPTION 'PLATFORM_CATALOG_FIELDS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_model_catalog_operator_field_guard BEFORE UPDATE ON ai_model_catalog
  FOR EACH ROW EXECUTE FUNCTION app.guard_operator_catalog_fields();

CREATE POLICY tenant_memberships_platform_roles ON tenant_memberships FOR UPDATE
  USING (app.platform_scope_allows(ARRAY['platform:roles:manage']))
  WITH CHECK (app.platform_scope_allows(ARRAY['platform:roles:manage']));
CREATE POLICY tenant_memberships_platform_roles_read ON tenant_memberships FOR SELECT
  USING (app.platform_scope_allows(ARRAY['platform:roles:manage']));
