ALTER TABLE billing_accounts
  ADD COLUMN IF NOT EXISTS membership_tier text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS membership_tier_source text NOT NULL DEFAULT 'migration',
  ADD COLUMN IF NOT EXISTS membership_tier_overridden_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS membership_tier_overridden_at timestamptz,
  ADD COLUMN IF NOT EXISTS membership_tier_expires_at timestamptz;

CREATE OR REPLACE FUNCTION app.current_is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.is_system_admin', true), '')::boolean, false)
$$;

DROP POLICY IF EXISTS tenant_memberships_select_system_admin ON tenant_memberships;
CREATE POLICY tenant_memberships_select_system_admin
  ON tenant_memberships
  FOR SELECT
  USING (app.current_is_system_admin());

DROP POLICY IF EXISTS tenants_select_system_admin ON tenants;
CREATE POLICY tenants_select_system_admin
  ON tenants
  FOR SELECT
  USING (app.current_is_system_admin());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billing_accounts_membership_tier_check'
  ) THEN
    ALTER TABLE billing_accounts
      ADD CONSTRAINT billing_accounts_membership_tier_check
      CHECK (membership_tier IN ('standard', 'silver', 'gold', 'platinum')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billing_accounts_membership_tier_source_check'
  ) THEN
    ALTER TABLE billing_accounts
      ADD CONSTRAINT billing_accounts_membership_tier_source_check
      CHECK (membership_tier_source IN ('plan', 'admin_override', 'migration', 'manual')) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS billing_credit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
  source_type text NOT NULL,
  source_id text,
  original_credits numeric(18, 4) NOT NULL CHECK (original_credits >= 0),
  remaining_credits numeric(18, 4) NOT NULL CHECK (remaining_credits >= 0),
  reserved_credits numeric(18, 4) NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_type IN ('plan', 'payment', 'redeem', 'admin_grant', 'migration')),
  CHECK (status IN ('active', 'exhausted', 'expired', 'revoked'))
);

CREATE TABLE IF NOT EXISTS billing_credit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  billing_ledger_id uuid NOT NULL REFERENCES billing_ledger(id),
  credit_grant_id uuid NOT NULL REFERENCES billing_credit_grants(id),
  usage_event_id uuid REFERENCES usage_events(id) ON DELETE SET NULL,
  amount_credits numeric(18, 4) NOT NULL CHECK (amount_credits > 0),
  status text NOT NULL DEFAULT 'reserved',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('reserved', 'settled', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_billing_credit_grants_tenant_active_expiry
  ON billing_credit_grants (tenant_id, status, expires_at ASC NULLS LAST, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_billing_credit_reservations_tenant_ledger
  ON billing_credit_reservations (tenant_id, billing_ledger_id);

INSERT INTO billing_credit_grants (
  tenant_id,
  billing_account_id,
  source_type,
  source_id,
  original_credits,
  remaining_credits,
  reserved_credits,
  expires_at,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT
  account.tenant_id,
  account.id,
  'migration',
  account.id::text,
  account.balance_cents,
  account.balance_cents,
  account.reserved_cents,
  NULL,
  CASE WHEN account.balance_cents <= 0 THEN 'exhausted' ELSE 'active' END,
  jsonb_build_object('source', 'pre-expiry billing_accounts balance'),
  now(),
  now()
FROM billing_accounts AS account
WHERE NOT EXISTS (
  SELECT 1
  FROM billing_credit_grants AS grant
  WHERE grant.billing_account_id = account.id
    AND grant.source_type = 'migration'
);

ALTER TABLE billing_credit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_credit_grants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_credit_grants_select_current_tenant ON billing_credit_grants;
CREATE POLICY billing_credit_grants_select_current_tenant
  ON billing_credit_grants
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS billing_credit_grants_insert_current_tenant ON billing_credit_grants;
CREATE POLICY billing_credit_grants_insert_current_tenant
  ON billing_credit_grants
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS billing_credit_grants_update_current_tenant ON billing_credit_grants;
CREATE POLICY billing_credit_grants_update_current_tenant
  ON billing_credit_grants
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE billing_credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_credit_reservations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_credit_reservations_select_current_tenant ON billing_credit_reservations;
CREATE POLICY billing_credit_reservations_select_current_tenant
  ON billing_credit_reservations
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS billing_credit_reservations_insert_current_tenant ON billing_credit_reservations;
CREATE POLICY billing_credit_reservations_insert_current_tenant
  ON billing_credit_reservations
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS billing_credit_reservations_update_current_tenant ON billing_credit_reservations;
CREATE POLICY billing_credit_reservations_update_current_tenant
  ON billing_credit_reservations
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
