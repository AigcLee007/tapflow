-- Service-controlled checkout creation. The API role cannot directly mutate
-- payment orders under forced RLS; these narrow functions run as the existing
-- no-login wallet callback role and snapshot the server-owned plan values.
CREATE POLICY billing_wallets_insert_callback ON billing_wallets FOR INSERT TO tapflow_wallet_callback
  WITH CHECK (current_user = 'tapflow_wallet_callback');

CREATE POLICY billing_wallet_payments_insert_callback ON billing_wallet_payments FOR INSERT TO tapflow_wallet_callback
  WITH CHECK (current_user = 'tapflow_wallet_callback');

GRANT INSERT ON billing_wallets TO tapflow_wallet_callback;
GRANT INSERT ON billing_wallet_payments TO tapflow_wallet_callback;

GRANT tapflow_wallet_callback TO CURRENT_USER;

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
  WHERE key = p_plan_key AND active
  FOR SHARE;
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

CREATE OR REPLACE FUNCTION app.mark_wallet_payment_checkout(
  p_payment_id uuid,
  p_checkout_url text,
  p_qr_code_url text
)
RETURNS billing_wallet_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_payment billing_wallet_payments%ROWTYPE;
BEGIN
  SELECT * INTO v_payment
  FROM billing_wallet_payments
  WHERE id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found';
  END IF;
  IF v_payment.status NOT IN ('pending', 'checkout_created') THEN
    RAISE EXCEPTION 'payment cannot create checkout from %', v_payment.status;
  END IF;

  UPDATE billing_wallet_payments
  SET status = 'checkout_created',
      metadata = metadata || jsonb_build_object('checkoutUrl', p_checkout_url, 'qrCodeUrl', p_qr_code_url),
      updated_at = now()
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;
  RETURN v_payment;
END;
$$;

CREATE OR REPLACE FUNCTION app.get_wallet_payment_by_order(p_merchant_order_id text)
RETURNS billing_wallet_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $$
DECLARE v_payment billing_wallet_payments%ROWTYPE;
BEGIN
  SELECT * INTO v_payment FROM billing_wallet_payments
  WHERE merchant_order_id = p_merchant_order_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment not found'; END IF;
  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION app.create_wallet_payment(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.mark_wallet_payment_checkout(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_wallet_payment_by_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.create_wallet_payment(uuid, text, text, text) TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION app.mark_wallet_payment_checkout(uuid, text, text) TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION app.get_wallet_payment_by_order(text) TO CURRENT_USER;
ALTER FUNCTION app.create_wallet_payment(uuid, text, text, text) OWNER TO tapflow_wallet_callback;
ALTER FUNCTION app.mark_wallet_payment_checkout(uuid, text, text) OWNER TO tapflow_wallet_callback;
ALTER FUNCTION app.get_wallet_payment_by_order(text) OWNER TO tapflow_wallet_callback;
REVOKE tapflow_wallet_callback FROM CURRENT_USER;
