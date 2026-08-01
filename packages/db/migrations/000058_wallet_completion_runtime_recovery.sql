-- Repair wallet completion under PL/pgSQL RETURNS TABLE output-name collisions
-- and restore runtime execution for completion and expiry operations.

GRANT USAGE, CREATE ON SCHEMA app TO tapflow_wallet_callback;
GRANT tapflow_wallet_callback TO CURRENT_USER WITH INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
SET LOCAL ROLE tapflow_wallet_callback;

CREATE OR REPLACE FUNCTION app.wallet_settle_or_refund(
  p_operation text,
  p_user_id uuid,
  p_tenant_id uuid,
  p_reserve_ledger_id uuid,
  p_usage_event_id uuid,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid,
  wallet_id uuid,
  user_id uuid,
  tenant_id uuid,
  usage_event_id uuid,
  entry_type text,
  amount_credits numeric,
  idempotency_key text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_wallet billing_wallets%ROWTYPE;
  v_reserve billing_wallet_ledger%ROWTYPE;
  v_ledger billing_wallet_ledger%ROWTYPE;
  v_reservation billing_wallet_credit_reservations%ROWTYPE;
  v_grant billing_wallet_credit_grants%ROWTYPE;
  v_total numeric := 0;
  v_expired_refund numeric := 0;
BEGIN
  IF p_operation NOT IN ('settle', 'refund') OR p_idempotency_key = ''
    OR (p_operation = 'settle' AND p_usage_event_id IS NULL) THEN
    RAISE EXCEPTION 'invalid wallet completion';
  END IF;

  SELECT wallet.* INTO v_wallet
  FROM billing_wallets AS wallet
  WHERE wallet.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  SELECT ledger.* INTO v_ledger
  FROM billing_wallet_ledger AS ledger
  WHERE ledger.user_id = p_user_id
    AND ledger.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_ledger.entry_type <> p_operation
      OR v_ledger.tenant_id IS DISTINCT FROM p_tenant_id
      OR (p_operation = 'settle' AND v_ledger.usage_event_id IS DISTINCT FROM p_usage_event_id) THEN
      RAISE EXCEPTION 'WALLET_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id,
      v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits,
      v_ledger.idempotency_key, v_ledger.created_at;
    RETURN;
  END IF;

  SELECT reserve_ledger.* INTO v_reserve
  FROM billing_wallet_ledger AS reserve_ledger
  WHERE reserve_ledger.id = p_reserve_ledger_id
    AND reserve_ledger.user_id = p_user_id
    AND reserve_ledger.entry_type = 'reserve'
  FOR UPDATE;
  IF NOT FOUND OR v_reserve.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  FOR v_reservation IN
    SELECT reservation.*
    FROM billing_wallet_credit_reservations AS reservation
    WHERE reservation.user_id = p_user_id
      AND reservation.wallet_ledger_id = p_reserve_ledger_id
      AND reservation.status = 'reserved'
    FOR UPDATE
  LOOP
    SELECT credit_grant.* INTO v_grant
    FROM billing_wallet_credit_grants AS credit_grant
    WHERE credit_grant.id = v_reservation.credit_grant_id
    FOR UPDATE;

    v_total := v_total + v_reservation.amount_credits;
    IF p_operation = 'settle' THEN
      UPDATE billing_wallet_credit_grants AS credit_grant
      SET remaining_credits = credit_grant.remaining_credits - v_reservation.amount_credits,
          reserved_credits = credit_grant.reserved_credits - v_reservation.amount_credits,
          status = CASE
            WHEN credit_grant.remaining_credits - v_reservation.amount_credits = 0 THEN 'exhausted'
            ELSE credit_grant.status
          END,
          updated_at = now()
      WHERE credit_grant.id = v_grant.id;

      UPDATE billing_wallet_credit_reservations AS reservation
      SET status = 'settled',
          usage_event_id = p_usage_event_id,
          updated_at = now()
      WHERE reservation.id = v_reservation.id;
    ELSE
      -- An expired grant may only release its reservation; it must not become spendable again.
      IF v_grant.status = 'expired' THEN
        v_expired_refund := v_expired_refund + v_reservation.amount_credits;
      END IF;

      UPDATE billing_wallet_credit_grants AS credit_grant
      SET reserved_credits = credit_grant.reserved_credits - v_reservation.amount_credits,
          remaining_credits = CASE
            WHEN credit_grant.status = 'expired'
              THEN credit_grant.reserved_credits - v_reservation.amount_credits
            ELSE credit_grant.remaining_credits
          END,
          updated_at = now()
      WHERE credit_grant.id = v_grant.id;

      UPDATE billing_wallet_credit_reservations AS reservation
      SET status = 'refunded',
          updated_at = now()
      WHERE reservation.id = v_reservation.id;
    END IF;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  INSERT INTO billing_wallet_ledger (
    wallet_id,
    user_id,
    tenant_id,
    usage_event_id,
    entry_type,
    amount_credits,
    idempotency_key,
    metadata
  ) VALUES (
    v_wallet.id,
    p_user_id,
    p_tenant_id,
    CASE WHEN p_operation = 'settle' THEN p_usage_event_id ELSE NULL END,
    p_operation,
    CASE WHEN p_operation = 'settle' THEN -v_total ELSE v_total END,
    p_idempotency_key,
    COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING * INTO v_ledger;

  UPDATE billing_wallets AS wallet
  SET balance_credits = CASE
        WHEN p_operation = 'settle' THEN wallet.balance_credits - v_total
        WHEN p_operation = 'refund' THEN GREATEST(wallet.balance_credits - v_expired_refund, 0)
        ELSE wallet.balance_credits
      END,
      reserved_credits = wallet.reserved_credits - v_total,
      updated_at = now()
  WHERE wallet.id = v_wallet.id;

  RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id,
    v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits,
    v_ledger.idempotency_key, v_ledger.created_at;
END;
$$;

REVOKE ALL ON FUNCTION app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.wallet_expire_due(integer, timestamptz) FROM PUBLIC;

DO $$
DECLARE
  runtime_role name := COALESCE(
    NULLIF(current_setting('app.api_database_role', true), ''),
    session_user
  );
BEGIN
  IF runtime_role = 'tapflow_wallet_callback' THEN
    RAISE EXCEPTION 'API_DATABASE_ROLE must be the runtime API role, not the callback owner';
  END IF;

  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb) TO %I',
    runtime_role
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION app.wallet_expire_due(integer, timestamptz) TO %I',
    runtime_role
  );
END;
$$;

RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM tapflow_wallet_callback;
REVOKE tapflow_wallet_callback FROM CURRENT_USER GRANTED BY CURRENT_USER;
