-- Refund claims freeze their payment grant while the provider request is
-- unresolved. A provider response that proves the refund was not accepted
-- releases that hold and returns the order to a retryable paid state.
ALTER TABLE billing_wallet_credit_grants
  ADD COLUMN IF NOT EXISTS refund_hold boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_billing_wallet_grants_refund_hold
  ON billing_wallet_credit_grants (wallet_id, refund_hold)
  WHERE refund_hold;

GRANT USAGE, CREATE ON SCHEMA app TO tapflow_wallet_callback;
GRANT tapflow_wallet_callback TO CURRENT_USER WITH INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
SET LOCAL ROLE tapflow_wallet_callback;

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

  SELECT * INTO v_payment FROM billing_wallet_payments
    WHERE merchant_order_id = p_trade_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown merchant order'; END IF;
  IF v_payment.amount_cents <> p_amount_cents THEN RAISE EXCEPTION 'payment amount mismatch'; END IF;

  IF p_provider_state = 'OD' THEN
    IF v_payment.status = 'paid' THEN
      IF (p_provider_transaction_id IS NOT NULL AND v_payment.provider_transaction_id IS DISTINCT FROM p_provider_transaction_id)
        OR (p_provider_open_order_id IS NOT NULL AND v_payment.provider_open_order_id IS DISTINCT FROM p_provider_open_order_id) THEN
        RAISE EXCEPTION 'conflicting paid payment notification';
      END IF;
      RETURN false;
    END IF;
    -- OD is also the normal payment-success callback. A refund request can
    -- still be unresolved at that point, so only the explicit admin query or
    -- reconciler path may release a refund claim.
    IF v_payment.status = 'refund_pending' THEN RETURN false; END IF;
    IF v_payment.status NOT IN ('pending', 'checkout_created') THEN
      RAISE EXCEPTION 'incompatible OD payment transition from %', v_payment.status;
    END IF;
    v_expires_at := p_event_time + make_interval(days => v_payment.validity_days_snapshot);
    v_ledger_id := gen_random_uuid();
    INSERT INTO billing_wallet_ledger (id, wallet_id, user_id, entry_type, amount_credits, idempotency_key, description, metadata)
      VALUES (v_ledger_id, v_payment.wallet_id, v_payment.user_id, 'payment', v_payment.credits,
        'payment:' || v_payment.id::text, 'XunhuPay payment credit',
        jsonb_build_object('paymentId', v_payment.id, 'merchantOrderId', v_payment.merchant_order_id));
    INSERT INTO billing_wallet_credit_grants (wallet_id, user_id, source_type, source_id, original_credits, remaining_credits,
      expires_at, status, metadata, created_at, updated_at)
      VALUES (v_payment.wallet_id, v_payment.user_id, 'payment', v_payment.id::text, v_payment.credits, v_payment.credits,
        v_expires_at, 'active', jsonb_build_object('paymentId', v_payment.id, 'merchantOrderId', v_payment.merchant_order_id), p_event_time, p_event_time);
    UPDATE billing_wallets SET balance_credits = balance_credits + v_payment.credits, updated_at = p_event_time
      WHERE id = v_payment.wallet_id;
    UPDATE billing_wallet_payments SET status = 'paid', provider_transaction_id = COALESCE(p_provider_transaction_id, provider_transaction_id),
      provider_open_order_id = COALESCE(p_provider_open_order_id, provider_open_order_id), billing_ledger_id = v_ledger_id,
      paid_at = p_event_time, expires_at_snapshot = v_expires_at, updated_at = p_event_time WHERE id = v_payment.id;
    RETURN true;
  ELSIF p_provider_state = 'RD' THEN
    IF v_payment.status = 'refund_pending' THEN RETURN false; END IF;
    IF v_payment.status <> 'paid' THEN RAISE EXCEPTION 'incompatible RD payment transition from %', v_payment.status; END IF;
    SELECT * INTO v_grant FROM billing_wallet_credit_grants WHERE wallet_id = v_payment.wallet_id
      AND source_type = 'payment' AND source_id = v_payment.id::text FOR UPDATE;
    IF NOT FOUND OR v_grant.remaining_credits <> v_grant.original_credits OR v_grant.reserved_credits <> 0 THEN
      RAISE EXCEPTION 'payment grant is not eligible for refund';
    END IF;
    UPDATE billing_wallet_credit_grants SET refund_hold = true, updated_at = p_event_time WHERE id = v_grant.id;
    UPDATE billing_wallet_payments SET status = 'refund_pending', provider_transaction_id = COALESCE(p_provider_transaction_id, provider_transaction_id),
      provider_open_order_id = COALESCE(p_provider_open_order_id, provider_open_order_id), updated_at = p_event_time WHERE id = v_payment.id;
    RETURN true;
  ELSIF p_provider_state = 'UD' THEN
    IF v_payment.status = 'refund_failed' THEN RETURN false; END IF;
    IF v_payment.status <> 'refund_pending' THEN RAISE EXCEPTION 'incompatible UD payment transition from %', v_payment.status; END IF;
    UPDATE billing_wallet_credit_grants SET refund_hold = false, updated_at = p_event_time
      WHERE wallet_id = v_payment.wallet_id AND source_type = 'payment' AND source_id = v_payment.id::text;
    UPDATE billing_wallet_payments SET status = 'paid', failure_code = 'REFUND_REJECTED',
      provider_transaction_id = COALESCE(p_provider_transaction_id, provider_transaction_id),
      provider_open_order_id = COALESCE(p_provider_open_order_id, provider_open_order_id), updated_at = p_event_time WHERE id = v_payment.id;
    RETURN true;
  ELSIF p_provider_state = 'CD' THEN
    IF v_payment.status = 'refunded' THEN RETURN false; END IF;
    IF v_payment.status NOT IN ('paid', 'refund_pending') THEN RAISE EXCEPTION 'incompatible CD payment transition from %', v_payment.status; END IF;
    SELECT * INTO v_grant FROM billing_wallet_credit_grants WHERE wallet_id = v_payment.wallet_id
      AND source_type = 'payment' AND source_id = v_payment.id::text FOR UPDATE;
    IF NOT FOUND OR v_grant.remaining_credits <> v_grant.original_credits OR v_grant.reserved_credits <> 0 THEN
      RAISE EXCEPTION 'payment grant is not eligible for refund';
    END IF;
    INSERT INTO billing_wallet_ledger (wallet_id, user_id, entry_type, amount_credits, idempotency_key, description, metadata)
      VALUES (v_payment.wallet_id, v_payment.user_id, 'payment_refund', -v_grant.remaining_credits,
        'payment_refund:' || v_payment.id::text, 'XunhuPay payment refund',
        jsonb_build_object('paymentId', v_payment.id, 'merchantOrderId', v_payment.merchant_order_id));
    UPDATE billing_wallet_credit_grants SET remaining_credits = 0, refund_hold = false, status = 'revoked', updated_at = p_event_time WHERE id = v_grant.id;
    UPDATE billing_wallets SET balance_credits = balance_credits - v_grant.remaining_credits, updated_at = p_event_time WHERE id = v_payment.wallet_id;
    UPDATE billing_wallet_payments SET status = 'refunded', provider_transaction_id = COALESCE(p_provider_transaction_id, provider_transaction_id),
      provider_open_order_id = COALESCE(p_provider_open_order_id, provider_open_order_id), updated_at = p_event_time WHERE id = v_payment.id;
    RETURN true;
  END IF;
  RAISE EXCEPTION 'unsupported provider payment state %', p_provider_state;
END;
$$;

RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM tapflow_wallet_callback;
REVOKE tapflow_wallet_callback FROM CURRENT_USER GRANTED BY CURRENT_USER;
