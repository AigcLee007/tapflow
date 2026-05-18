CREATE TABLE IF NOT EXISTS billing_redeem_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  code_hash text NOT NULL UNIQUE,
  credits bigint NOT NULL CHECK (credits > 0),
  status text NOT NULL DEFAULT 'active',
  max_redemptions int NOT NULL DEFAULT 1 CHECK (max_redemptions > 0),
  redeemed_count int NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0),
  expires_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS billing_redeem_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redeem_code_id uuid NOT NULL REFERENCES billing_redeem_codes(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid REFERENCES users(id),
  billing_ledger_id uuid REFERENCES billing_ledger(id),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, redeem_code_id, user_id),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  monthly_credits bigint NOT NULL DEFAULT 0,
  price_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  route text NOT NULL DEFAULT 'default',
  unit text NOT NULL,
  unit_credits bigint NOT NULL CHECK (unit_credits >= 0),
  min_charge_credits bigint NOT NULL DEFAULT 0 CHECK (min_charge_credits >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model, route, unit)
);

CREATE TABLE IF NOT EXISTS billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid REFERENCES users(id),
  provider text NOT NULL,
  provider_payment_id text,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  credits bigint NOT NULL CHECK (credits >= 0),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',
  billing_ledger_id uuid REFERENCES billing_ledger(id),
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (provider, provider_payment_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_redeem_codes_tenant_status
  ON billing_redeem_codes (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_billing_redeem_redemptions_tenant_created_at
  ON billing_redeem_code_redemptions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_payments_tenant_created_at
  ON billing_payments (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_model_pricing_active_unit
  ON model_pricing (active, unit);

INSERT INTO model_pricing (provider, model, route, unit, unit_credits, min_charge_credits, metadata)
VALUES
  ('default', 'default', 'default', 'text_generation', 1, 1, '{"label":"Default text generation estimate"}'::jsonb),
  ('default', 'default', 'default', 'image_generation', 10, 10, '{"label":"Default image generation estimate"}'::jsonb),
  ('default', 'default', 'default', 'video_generation', 50, 50, '{"label":"Default video generation estimate"}'::jsonb)
ON CONFLICT (provider, model, route, unit) DO NOTHING;

ALTER TABLE billing_redeem_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_redeem_codes FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_redeem_codes_select_visible
  ON billing_redeem_codes
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

CREATE POLICY billing_redeem_codes_insert_current_tenant
  ON billing_redeem_codes
  FOR INSERT
  WITH CHECK (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

CREATE POLICY billing_redeem_codes_update_current_tenant
  ON billing_redeem_codes
  FOR UPDATE
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

CREATE POLICY billing_redeem_codes_delete_current_tenant
  ON billing_redeem_codes
  FOR DELETE
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id());

ALTER TABLE billing_redeem_code_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_redeem_code_redemptions FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_redeem_redemptions_select_current_tenant
  ON billing_redeem_code_redemptions
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY billing_redeem_redemptions_insert_current_tenant
  ON billing_redeem_code_redemptions
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY billing_redeem_redemptions_update_current_tenant
  ON billing_redeem_code_redemptions
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY billing_redeem_redemptions_delete_current_tenant
  ON billing_redeem_code_redemptions
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

ALTER TABLE billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_payments FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_payments_select_current_tenant
  ON billing_payments
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY billing_payments_insert_current_tenant
  ON billing_payments
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY billing_payments_update_current_tenant
  ON billing_payments
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY billing_payments_delete_current_tenant
  ON billing_payments
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());
