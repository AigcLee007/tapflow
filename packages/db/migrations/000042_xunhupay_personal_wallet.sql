-- Personal wallets intentionally omit tenant_id: a wallet belongs to one user across every workspace.
CREATE TABLE IF NOT EXISTS billing_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_credits numeric(18, 4) NOT NULL DEFAULT 0 CHECK (balance_credits >= 0),
  reserved_credits numeric(18, 4) NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

COMMENT ON TABLE billing_wallets IS
  'Intentional no-tenant_id exception: one user-owned wallet is shared across all workspaces.';

-- Personal grant batches intentionally omit tenant_id because their owner is the wallet user.
CREATE TABLE IF NOT EXISTS billing_wallet_credit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES billing_wallets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('payment', 'redeem', 'admin_grant', 'migration')),
  source_id text,
  original_credits numeric(18, 4) NOT NULL CHECK (original_credits > 0),
  remaining_credits numeric(18, 4) NOT NULL CHECK (remaining_credits >= 0),
  reserved_credits numeric(18, 4) NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exhausted', 'expired', 'revoked')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (remaining_credits + reserved_credits <= original_credits)
);

COMMENT ON TABLE billing_wallet_credit_grants IS
  'Intentional no-tenant_id exception: personal wallet grant batches are owned by user_id.';

-- Personal ledger rows keep optional workspace attribution without making the balance tenant-owned.
CREATE TABLE IF NOT EXISTS billing_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES billing_wallets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  workflow_run_id uuid REFERENCES workflow_runs(id) ON DELETE SET NULL,
  node_run_id uuid REFERENCES node_runs(id) ON DELETE SET NULL,
  usage_event_id uuid REFERENCES usage_events(id) ON DELETE SET NULL,
  entry_type text NOT NULL CHECK (entry_type IN (
    'payment', 'migration_credit', 'admin_credit', 'reserve', 'settle', 'refund', 'expire', 'payment_refund'
  )),
  amount_credits numeric(18, 4) NOT NULL CHECK (amount_credits <> 0),
  idempotency_key text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

COMMENT ON TABLE billing_wallet_ledger IS
  'Intentional no-tenant_id exception: immutable personal ledger; tenant_id is optional usage attribution only.';

-- Reservations preserve the exact personal grant allocation used by a reserve operation.
CREATE TABLE IF NOT EXISTS billing_wallet_credit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES billing_wallets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_ledger_id uuid NOT NULL REFERENCES billing_wallet_ledger(id) ON DELETE CASCADE,
  credit_grant_id uuid NOT NULL REFERENCES billing_wallet_credit_grants(id) ON DELETE RESTRICT,
  usage_event_id uuid REFERENCES usage_events(id) ON DELETE SET NULL,
  amount_credits numeric(18, 4) NOT NULL CHECK (amount_credits > 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'refunded')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wallet_ledger_id, credit_grant_id)
);

COMMENT ON TABLE billing_wallet_credit_reservations IS
  'Intentional no-tenant_id exception: reservation allocations belong to a personal wallet user.';

-- Recharge plans intentionally omit tenant_id because they are a platform-global commercial catalog.
CREATE TABLE IF NOT EXISTS billing_recharge_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  credits numeric(18, 4) NOT NULL CHECK (credits > 0),
  currency text NOT NULL DEFAULT 'CNY' CHECK (currency = 'CNY'),
  validity_days int NOT NULL CHECK (validity_days > 0),
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE billing_recharge_plans IS
  'Intentional no-tenant_id exception: platform-global recharge plan catalog.';

-- Payment orders intentionally omit tenant_id: checkout and credits are owned by one personal wallet user.
CREATE TABLE IF NOT EXISTS billing_wallet_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES billing_wallets(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES billing_recharge_plans(id) ON DELETE RESTRICT,
  plan_key text NOT NULL,
  merchant_order_id text NOT NULL CHECK (char_length(merchant_order_id) <= 32),
  provider text NOT NULL DEFAULT 'xunhupay' CHECK (provider = 'xunhupay'),
  provider_transaction_id text,
  provider_open_order_id text,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  credits numeric(18, 4) NOT NULL CHECK (credits > 0),
  currency text NOT NULL DEFAULT 'CNY' CHECK (currency = 'CNY'),
  plan_name_snapshot text NOT NULL,
  validity_days_snapshot int NOT NULL CHECK (validity_days_snapshot > 0),
  expires_at_snapshot timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'checkout_created', 'paid', 'create_failed', 'cancelled', 'refund_pending', 'refunded', 'refund_failed'
  )),
  billing_ledger_id uuid REFERENCES billing_wallet_ledger(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  failure_code text,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (merchant_order_id)
);

COMMENT ON TABLE billing_wallet_payments IS
  'Intentional no-tenant_id exception: payment orders and plan snapshots are owned by user_id.';

CREATE INDEX IF NOT EXISTS idx_billing_wallet_grants_fefo
  ON billing_wallet_credit_grants (wallet_id, status, expires_at ASC NULLS LAST, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_billing_wallet_ledger_user_created
  ON billing_wallet_ledger (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_billing_wallet_reservations_grant
  ON billing_wallet_credit_reservations (credit_grant_id, status, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_billing_recharge_plans_active_sort
  ON billing_recharge_plans (active, sort_order ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_billing_wallet_payments_user_created
  ON billing_wallet_payments (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_billing_wallet_payments_reconciliation
  ON billing_wallet_payments (status, updated_at ASC, created_at ASC)
  WHERE status IN ('pending', 'checkout_created', 'refund_pending');

ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS billed_user_id uuid REFERENCES users(id);

ALTER TABLE workbench_generations
  ADD COLUMN IF NOT EXISTS billed_user_id uuid REFERENCES users(id);

ALTER TABLE usage_events
  ADD COLUMN IF NOT EXISTS billed_user_id uuid REFERENCES users(id);

UPDATE workflow_runs
SET billed_user_id = created_by
WHERE billed_user_id IS NULL
  AND created_by IS NOT NULL;

UPDATE workbench_generations
SET billed_user_id = created_by
WHERE billed_user_id IS NULL
  AND created_by IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM workflow_runs WHERE billed_user_id IS NULL) THEN
    RAISE EXCEPTION 'workflow_runs backfill left rows without billed_user_id';
  END IF;

  IF EXISTS (SELECT 1 FROM workbench_generations WHERE billed_user_id IS NULL) THEN
    RAISE EXCEPTION 'workbench_generations backfill left rows without billed_user_id';
  END IF;
END $$;

ALTER TABLE workflow_runs
  ALTER COLUMN billed_user_id SET NOT NULL;

ALTER TABLE workbench_generations
  ALTER COLUMN billed_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_runs_billed_user_created
  ON workflow_runs (billed_user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_workbench_generations_billed_user_created
  ON workbench_generations (billed_user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_billed_user_created
  ON usage_events (billed_user_id, created_at DESC, id DESC);

DROP POLICY IF EXISTS usage_events_select_billed_user ON usage_events;
CREATE POLICY usage_events_select_billed_user
  ON usage_events
  FOR SELECT
  USING (billed_user_id = app.current_user_id());

INSERT INTO billing_recharge_plans (key, name, amount_cents, credits, validity_days, active, sort_order)
VALUES
  ('credits_100', '100 AI credits', 990, 100, 365, true, 10),
  ('credits_700', '700 AI credits', 5000, 700, 365, true, 20),
  ('credits_1500', '1,500 AI credits', 10000, 1500, 365, true, 30),
  ('credits_3300', '3,300 AI credits', 20000, 3300, 365, true, 40)
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions (key, description)
VALUES
  ('billing:plans:manage', 'Manage global recharge plans'),
  ('billing:payments:manage', 'Manage platform payment operations'),
  ('billing:refund', 'Issue eligible platform payment refunds')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_key)
SELECT roles.id, permissions.key
FROM roles
JOIN permissions
  ON permissions.key IN ('billing:plans:manage', 'billing:payments:manage', 'billing:refund')
WHERE roles.tenant_id IS NULL
  AND roles.key = 'system_admin'
ON CONFLICT (role_id, permission_key) DO NOTHING;

ALTER TABLE billing_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_wallets FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_wallet_credit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_wallet_credit_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_wallet_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_wallet_credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_wallet_credit_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_recharge_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_recharge_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_wallet_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_wallet_payments FORCE ROW LEVEL SECURITY;

-- The migration owner is the configured API database role. This predicate remains
-- false for ordinary authenticated DB contexts, including provider callbacks with no app.user_id.
CREATE OR REPLACE FUNCTION app.current_is_wallet_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, app
AS $$
  SELECT current_user = (
    SELECT pg_get_userbyid(proc.proowner)
    FROM pg_proc AS proc
    WHERE proc.oid = 'app.apply_xunhu_payment_notification(text, bigint, text, text, text, timestamptz)'::regprocedure
  )
$$;

DROP POLICY IF EXISTS billing_wallets_select_owner ON billing_wallets;
CREATE POLICY billing_wallets_select_owner ON billing_wallets FOR SELECT
  USING (user_id = app.current_user_id());
DROP POLICY IF EXISTS billing_wallets_select_system_admin ON billing_wallets;
CREATE POLICY billing_wallets_select_system_admin ON billing_wallets FOR SELECT
  USING (app.current_is_system_admin());
DROP POLICY IF EXISTS billing_wallets_insert_owner ON billing_wallets;
DROP POLICY IF EXISTS billing_wallets_update_owner ON billing_wallets;
DROP POLICY IF EXISTS billing_wallets_write_wallet_service ON billing_wallets;
CREATE POLICY billing_wallets_write_wallet_service ON billing_wallets FOR ALL
  USING (app.current_is_wallet_service_role()) WITH CHECK (app.current_is_wallet_service_role());
DROP POLICY IF EXISTS billing_wallets_write_system_admin ON billing_wallets;
CREATE POLICY billing_wallets_write_system_admin ON billing_wallets FOR ALL
  USING (app.current_is_system_admin()) WITH CHECK (app.current_is_system_admin());

DROP POLICY IF EXISTS billing_wallet_credit_grants_select_owner ON billing_wallet_credit_grants;
CREATE POLICY billing_wallet_credit_grants_select_owner ON billing_wallet_credit_grants FOR SELECT
  USING (user_id = app.current_user_id());
DROP POLICY IF EXISTS billing_wallet_credit_grants_select_system_admin ON billing_wallet_credit_grants;
CREATE POLICY billing_wallet_credit_grants_select_system_admin ON billing_wallet_credit_grants FOR SELECT
  USING (app.current_is_system_admin());
DROP POLICY IF EXISTS billing_wallet_credit_grants_insert_owner ON billing_wallet_credit_grants;
DROP POLICY IF EXISTS billing_wallet_credit_grants_update_owner ON billing_wallet_credit_grants;
DROP POLICY IF EXISTS billing_wallet_credit_grants_write_wallet_service ON billing_wallet_credit_grants;
CREATE POLICY billing_wallet_credit_grants_write_wallet_service ON billing_wallet_credit_grants FOR ALL
  USING (app.current_is_wallet_service_role()) WITH CHECK (app.current_is_wallet_service_role());
DROP POLICY IF EXISTS billing_wallet_credit_grants_write_system_admin ON billing_wallet_credit_grants;
CREATE POLICY billing_wallet_credit_grants_write_system_admin ON billing_wallet_credit_grants FOR ALL
  USING (app.current_is_system_admin()) WITH CHECK (app.current_is_system_admin());

DROP POLICY IF EXISTS billing_wallet_ledger_select_owner ON billing_wallet_ledger;
CREATE POLICY billing_wallet_ledger_select_owner ON billing_wallet_ledger FOR SELECT
  USING (user_id = app.current_user_id());
DROP POLICY IF EXISTS billing_wallet_ledger_select_system_admin ON billing_wallet_ledger;
CREATE POLICY billing_wallet_ledger_select_system_admin ON billing_wallet_ledger FOR SELECT
  USING (app.current_is_system_admin());
DROP POLICY IF EXISTS billing_wallet_ledger_insert_owner ON billing_wallet_ledger;
DROP POLICY IF EXISTS billing_wallet_ledger_insert_wallet_service ON billing_wallet_ledger;
CREATE POLICY billing_wallet_ledger_insert_wallet_service ON billing_wallet_ledger FOR INSERT
  WITH CHECK (app.current_is_wallet_service_role());
DROP POLICY IF EXISTS billing_wallet_ledger_write_system_admin ON billing_wallet_ledger;
DROP POLICY IF EXISTS billing_wallet_ledger_insert_system_admin ON billing_wallet_ledger;
CREATE POLICY billing_wallet_ledger_insert_system_admin ON billing_wallet_ledger FOR INSERT
  WITH CHECK (app.current_is_system_admin());

DROP POLICY IF EXISTS billing_wallet_credit_reservations_select_owner ON billing_wallet_credit_reservations;
CREATE POLICY billing_wallet_credit_reservations_select_owner ON billing_wallet_credit_reservations FOR SELECT
  USING (user_id = app.current_user_id());
DROP POLICY IF EXISTS billing_wallet_credit_reservations_select_system_admin ON billing_wallet_credit_reservations;
CREATE POLICY billing_wallet_credit_reservations_select_system_admin ON billing_wallet_credit_reservations FOR SELECT
  USING (app.current_is_system_admin());
DROP POLICY IF EXISTS billing_wallet_credit_reservations_insert_owner ON billing_wallet_credit_reservations;
DROP POLICY IF EXISTS billing_wallet_credit_reservations_update_owner ON billing_wallet_credit_reservations;
DROP POLICY IF EXISTS billing_wallet_credit_reservations_write_wallet_service ON billing_wallet_credit_reservations;
CREATE POLICY billing_wallet_credit_reservations_write_wallet_service ON billing_wallet_credit_reservations FOR ALL
  USING (app.current_is_wallet_service_role()) WITH CHECK (app.current_is_wallet_service_role());
DROP POLICY IF EXISTS billing_wallet_credit_reservations_write_system_admin ON billing_wallet_credit_reservations;
CREATE POLICY billing_wallet_credit_reservations_write_system_admin ON billing_wallet_credit_reservations FOR ALL
  USING (app.current_is_system_admin()) WITH CHECK (app.current_is_system_admin());

DROP POLICY IF EXISTS billing_recharge_plans_select_active ON billing_recharge_plans;
DROP POLICY IF EXISTS billing_recharge_plans_select_wallet_service ON billing_recharge_plans;
CREATE POLICY billing_recharge_plans_select_wallet_service ON billing_recharge_plans FOR SELECT
  USING (app.current_is_wallet_service_role());
DROP POLICY IF EXISTS billing_recharge_plans_select_system_admin ON billing_recharge_plans;
CREATE POLICY billing_recharge_plans_select_system_admin ON billing_recharge_plans FOR SELECT
  USING (app.current_is_system_admin());
DROP POLICY IF EXISTS billing_recharge_plans_write_system_admin ON billing_recharge_plans;
CREATE POLICY billing_recharge_plans_write_system_admin ON billing_recharge_plans FOR ALL
  USING (app.current_is_system_admin()) WITH CHECK (app.current_is_system_admin());

DROP POLICY IF EXISTS billing_wallet_payments_select_owner ON billing_wallet_payments;
CREATE POLICY billing_wallet_payments_select_owner ON billing_wallet_payments FOR SELECT
  USING (user_id = app.current_user_id());
DROP POLICY IF EXISTS billing_wallet_payments_select_system_admin ON billing_wallet_payments;
CREATE POLICY billing_wallet_payments_select_system_admin ON billing_wallet_payments FOR SELECT
  USING (app.current_is_system_admin());
DROP POLICY IF EXISTS billing_wallet_payments_insert_owner ON billing_wallet_payments;
DROP POLICY IF EXISTS billing_wallet_payments_update_owner ON billing_wallet_payments;
DROP POLICY IF EXISTS billing_wallet_payments_write_wallet_service ON billing_wallet_payments;
CREATE POLICY billing_wallet_payments_write_wallet_service ON billing_wallet_payments FOR ALL
  USING (app.current_is_wallet_service_role()) WITH CHECK (app.current_is_wallet_service_role());
DROP POLICY IF EXISTS billing_wallet_payments_write_system_admin ON billing_wallet_payments;
CREATE POLICY billing_wallet_payments_write_system_admin ON billing_wallet_payments FOR ALL
  USING (app.current_is_system_admin()) WITH CHECK (app.current_is_system_admin());

CREATE OR REPLACE FUNCTION app.apply_xunhu_payment_notification(
  p_trade_order_id text,
  p_amount_cents bigint,
  p_provider_state text,
  p_provider_transaction_id text,
  p_provider_open_order_id text,
  p_event_time timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_payment billing_wallet_payments%ROWTYPE;
  v_grant billing_wallet_credit_grants%ROWTYPE;
  v_ledger_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF p_trade_order_id IS NULL OR p_amount_cents IS NULL OR p_event_time IS NULL THEN
    RAISE EXCEPTION 'payment notification requires order, amount, and event time';
  END IF;

  SELECT * INTO v_payment
  FROM billing_wallet_payments
  WHERE merchant_order_id = p_trade_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown merchant order';
  END IF;

  IF v_payment.amount_cents <> p_amount_cents THEN
    RAISE EXCEPTION 'payment amount mismatch';
  END IF;

  IF p_provider_state = 'OD' THEN
    IF v_payment.status = 'paid' THEN
      IF (p_provider_transaction_id IS NOT NULL AND v_payment.provider_transaction_id IS DISTINCT FROM p_provider_transaction_id)
        OR (p_provider_open_order_id IS NOT NULL AND v_payment.provider_open_order_id IS DISTINCT FROM p_provider_open_order_id) THEN
        RAISE EXCEPTION 'conflicting paid payment notification';
      END IF;
      RETURN false;
    END IF;

    IF v_payment.status NOT IN ('pending', 'checkout_created') THEN
      RAISE EXCEPTION 'incompatible OD payment transition from %', v_payment.status;
    END IF;

    v_expires_at := p_event_time + make_interval(days => v_payment.validity_days_snapshot);
    INSERT INTO billing_wallet_ledger (
      wallet_id, user_id, entry_type, amount_credits, idempotency_key, description, metadata
    ) VALUES (
      v_payment.wallet_id, v_payment.user_id, 'payment', v_payment.credits,
      'payment:' || v_payment.id::text, 'XunhuPay payment credit',
      jsonb_build_object('paymentId', v_payment.id, 'merchantOrderId', v_payment.merchant_order_id)
    ) RETURNING id INTO v_ledger_id;

    INSERT INTO billing_wallet_credit_grants (
      wallet_id, user_id, source_type, source_id, original_credits, remaining_credits,
      expires_at, status, metadata, created_at, updated_at
    ) VALUES (
      v_payment.wallet_id, v_payment.user_id, 'payment', v_payment.id::text,
      v_payment.credits, v_payment.credits, v_expires_at, 'active',
      jsonb_build_object('paymentId', v_payment.id, 'merchantOrderId', v_payment.merchant_order_id),
      p_event_time, p_event_time
    );

    UPDATE billing_wallets
    SET balance_credits = balance_credits + v_payment.credits,
        updated_at = p_event_time
    WHERE id = v_payment.wallet_id;

    UPDATE billing_wallet_payments
    SET status = 'paid',
        provider_transaction_id = COALESCE(p_provider_transaction_id, provider_transaction_id),
        provider_open_order_id = COALESCE(p_provider_open_order_id, provider_open_order_id),
        billing_ledger_id = v_ledger_id,
        paid_at = p_event_time,
        expires_at_snapshot = v_expires_at,
        updated_at = p_event_time
    WHERE id = v_payment.id;
    RETURN true;
  ELSIF p_provider_state = 'RD' THEN
    IF v_payment.status = 'refund_pending' THEN
      RETURN false;
    END IF;
    IF v_payment.status <> 'paid' THEN
      RAISE EXCEPTION 'incompatible RD payment transition from %', v_payment.status;
    END IF;
    UPDATE billing_wallet_payments
    SET status = 'refund_pending',
        provider_transaction_id = COALESCE(p_provider_transaction_id, provider_transaction_id),
        provider_open_order_id = COALESCE(p_provider_open_order_id, provider_open_order_id),
        updated_at = p_event_time
    WHERE id = v_payment.id;
    RETURN true;
  ELSIF p_provider_state = 'UD' THEN
    IF v_payment.status = 'refund_failed' THEN
      RETURN false;
    END IF;
    IF v_payment.status <> 'refund_pending' THEN
      RAISE EXCEPTION 'incompatible UD payment transition from %', v_payment.status;
    END IF;
    UPDATE billing_wallet_payments
    SET status = 'refund_failed',
        provider_transaction_id = COALESCE(p_provider_transaction_id, provider_transaction_id),
        provider_open_order_id = COALESCE(p_provider_open_order_id, provider_open_order_id),
        updated_at = p_event_time
    WHERE id = v_payment.id;
    RETURN true;
  ELSIF p_provider_state = 'CD' THEN
    IF v_payment.status = 'refunded' THEN
      RETURN false;
    END IF;
    IF v_payment.status NOT IN ('paid', 'refund_pending') THEN
      RAISE EXCEPTION 'incompatible CD payment transition from %', v_payment.status;
    END IF;

    SELECT * INTO v_grant
    FROM billing_wallet_credit_grants
    WHERE wallet_id = v_payment.wallet_id
      AND source_type = 'payment'
      AND source_id = v_payment.id::text
    FOR UPDATE;

    IF NOT FOUND OR v_grant.remaining_credits <> v_grant.original_credits OR v_grant.reserved_credits <> 0 THEN
      RAISE EXCEPTION 'payment grant is not eligible for refund';
    END IF;

    INSERT INTO billing_wallet_ledger (
      wallet_id, user_id, entry_type, amount_credits, idempotency_key, description, metadata
    ) VALUES (
      v_payment.wallet_id, v_payment.user_id, 'payment_refund', -v_grant.remaining_credits,
      'payment_refund:' || v_payment.id::text, 'XunhuPay payment refund',
      jsonb_build_object('paymentId', v_payment.id, 'merchantOrderId', v_payment.merchant_order_id)
    );

    UPDATE billing_wallet_credit_grants
    SET remaining_credits = 0,
        status = 'revoked',
        updated_at = p_event_time
    WHERE id = v_grant.id;

    UPDATE billing_wallets
    SET balance_credits = balance_credits - v_grant.remaining_credits,
        updated_at = p_event_time
    WHERE id = v_payment.wallet_id;

    UPDATE billing_wallet_payments
    SET status = 'refunded',
        provider_transaction_id = COALESCE(p_provider_transaction_id, provider_transaction_id),
        provider_open_order_id = COALESCE(p_provider_open_order_id, provider_open_order_id),
        updated_at = p_event_time
    WHERE id = v_payment.id;
    RETURN true;
  END IF;

  RAISE EXCEPTION 'unsupported provider payment state %', p_provider_state;
END;
$$;

CREATE OR REPLACE FUNCTION app.list_active_billing_recharge_plans()
RETURNS TABLE (
  id uuid,
  key text,
  name text,
  amount_cents bigint,
  credits numeric(18, 4),
  currency text,
  validity_days int,
  sort_order int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $$
  SELECT
    plan.id,
    plan.key,
    plan.name,
    plan.amount_cents,
    plan.credits,
    plan.currency,
    plan.validity_days,
    plan.sort_order
  FROM billing_recharge_plans AS plan
  WHERE plan.active
  ORDER BY plan.sort_order ASC, plan.id ASC
$$;

REVOKE ALL ON FUNCTION app.apply_xunhu_payment_notification(text, bigint, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.list_active_billing_recharge_plans() FROM PUBLIC;
