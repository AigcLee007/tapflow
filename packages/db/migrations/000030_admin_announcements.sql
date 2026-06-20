CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  title text NOT NULL,
  body text NOT NULL,
  link_url text,
  image_url text,
  status text NOT NULL DEFAULT 'draft',
  audience text NOT NULL DEFAULT 'all',
  published_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('draft', 'published', 'archived')),
  CHECK (audience IN ('all', 'creator', 'admin'))
);

CREATE INDEX IF NOT EXISTS announcements_tenant_status_created_at_idx
  ON announcements (tenant_id, status, created_at DESC);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcements_select_current_tenant ON announcements;
CREATE POLICY announcements_select_current_tenant
  ON announcements
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS announcements_insert_current_tenant ON announcements;
CREATE POLICY announcements_insert_current_tenant
  ON announcements
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS announcements_update_current_tenant ON announcements;
CREATE POLICY announcements_update_current_tenant
  ON announcements
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS announcements_delete_current_tenant ON announcements;
CREATE POLICY announcements_delete_current_tenant
  ON announcements
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS announcements_select_system_admin ON announcements;
CREATE POLICY announcements_select_system_admin
  ON announcements
  FOR SELECT
  USING (app.current_is_system_admin());

DROP POLICY IF EXISTS billing_accounts_select_system_admin ON billing_accounts;
CREATE POLICY billing_accounts_select_system_admin
  ON billing_accounts
  FOR SELECT
  USING (app.current_is_system_admin());

DROP POLICY IF EXISTS billing_credit_grants_select_system_admin ON billing_credit_grants;
CREATE POLICY billing_credit_grants_select_system_admin
  ON billing_credit_grants
  FOR SELECT
  USING (app.current_is_system_admin());

DROP POLICY IF EXISTS usage_events_select_system_admin ON usage_events;
CREATE POLICY usage_events_select_system_admin
  ON usage_events
  FOR SELECT
  USING (app.current_is_system_admin());

DROP POLICY IF EXISTS billing_ledger_select_system_admin ON billing_ledger;
CREATE POLICY billing_ledger_select_system_admin
  ON billing_ledger
  FOR SELECT
  USING (app.current_is_system_admin());

DROP POLICY IF EXISTS billing_redeem_codes_select_system_admin ON billing_redeem_codes;
CREATE POLICY billing_redeem_codes_select_system_admin
  ON billing_redeem_codes
  FOR SELECT
  USING (app.current_is_system_admin());

DROP POLICY IF EXISTS billing_redeem_codes_insert_system_admin ON billing_redeem_codes;
CREATE POLICY billing_redeem_codes_insert_system_admin
  ON billing_redeem_codes
  FOR INSERT
  WITH CHECK (app.current_is_system_admin());

DROP POLICY IF EXISTS billing_redeem_redemptions_select_system_admin ON billing_redeem_code_redemptions;
CREATE POLICY billing_redeem_redemptions_select_system_admin
  ON billing_redeem_code_redemptions
  FOR SELECT
  USING (app.current_is_system_admin());

DROP POLICY IF EXISTS ai_call_logs_select_system_admin ON ai_call_logs;
CREATE POLICY ai_call_logs_select_system_admin
  ON ai_call_logs
  FOR SELECT
  USING (app.current_is_system_admin());

INSERT INTO role_permissions (role_id, permission_key)
SELECT roles.id, 'admin:system'
FROM roles
WHERE roles.tenant_id IS NULL
  AND roles.key = 'tenant_admin'
ON CONFLICT (role_id, permission_key) DO NOTHING;
