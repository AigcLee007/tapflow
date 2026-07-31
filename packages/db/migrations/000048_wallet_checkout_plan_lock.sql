-- Reading a recharge plan does not need a row lock. PostgreSQL requires UPDATE
-- privilege for SELECT ... FOR SHARE, which would unnecessarily allow the
-- callback owner to modify administrator-managed recharge plans.
GRANT USAGE, CREATE ON SCHEMA app TO tapflow_wallet_callback;
GRANT tapflow_wallet_callback TO CURRENT_USER WITH INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
SET LOCAL ROLE tapflow_wallet_callback;

CREATE OR REPLACE FUNCTION app.create_wallet_payment(
  p_user_id uuid,
  p_plan_key text,
  p_idempotency_key text,
  p_merchant_order_id text
)
RETURNS billing_wallet_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_wallet billing_wallets%ROWTYPE;
  v_plan billing_recharge_plans%ROWTYPE;
  v_payment billing_wallet_payments%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_plan_key IS NULL OR p_idempotency_key IS NULL OR p_merchant_order_id IS NULL THEN
    RAISE EXCEPTION 'payment creation requires user, plan, idempotency key, and merchant order';
  END IF;

  SELECT * INTO v_plan
  FROM billing_recharge_plans
  WHERE key = p_plan_key AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recharge plan is inactive or unavailable';
  END IF;

  INSERT INTO billing_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_wallet
  FROM billing_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  INSERT INTO billing_wallet_payments (
    wallet_id, user_id, plan_id, plan_key, merchant_order_id,
    amount_cents, credits, currency, plan_name_snapshot,
    validity_days_snapshot, idempotency_key
  ) VALUES (
    v_wallet.id, p_user_id, v_plan.id, v_plan.key, p_merchant_order_id,
    v_plan.amount_cents, v_plan.credits, v_plan.currency, v_plan.name,
    v_plan.validity_days, p_idempotency_key
  )
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING * INTO v_payment;

  IF FOUND THEN
    RETURN v_payment;
  END IF;

  SELECT * INTO v_payment
  FROM billing_wallet_payments
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
  FOR SHARE;
  IF NOT FOUND OR v_payment.plan_key <> p_plan_key THEN
    RAISE EXCEPTION 'payment idempotency conflict';
  END IF;
  RETURN v_payment;
END;
$$;

ALTER FUNCTION app.create_wallet_payment(uuid, text, text, text)
  OWNER TO tapflow_wallet_callback;
REVOKE ALL ON FUNCTION app.create_wallet_payment(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.create_wallet_payment(uuid, text, text, text) TO SESSION_USER;

RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM tapflow_wallet_callback;
REVOKE tapflow_wallet_callback FROM CURRENT_USER GRANTED BY CURRENT_USER;
