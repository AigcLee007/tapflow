-- Make redeem-code lookup global while retaining the workspace where a user redeemed it.
-- This is a forward-only replacement for the deployed function in 000045.

GRANT USAGE, CREATE ON SCHEMA app TO tapflow_wallet_callback;
GRANT tapflow_wallet_callback TO CURRENT_USER WITH INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
SET LOCAL ROLE tapflow_wallet_callback;

CREATE OR REPLACE FUNCTION app.wallet_redeem_code(
  p_user_id uuid,
  p_tenant_id uuid,
  p_code_hash text,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid, wallet_id uuid, user_id uuid, tenant_id uuid, usage_event_id uuid,
  entry_type text, amount_credits numeric, idempotency_key text, created_at timestamptz,
  redemption_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_code billing_redeem_codes%ROWTYPE;
  v_redemption billing_redeem_code_redemptions%ROWTYPE;
  v_ledger billing_wallet_ledger%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_tenant_id IS NULL OR p_code_hash = '' OR p_idempotency_key = '' THEN
    RAISE EXCEPTION 'invalid wallet redeem';
  END IF;
  IF NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
    AND current_setting('app.user_id', true)::uuid <> p_user_id THEN
    RAISE EXCEPTION 'WALLET_FORBIDDEN';
  END IF;

  SELECT * INTO v_redemption
  FROM billing_redeem_code_redemptions
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO v_ledger FROM billing_wallet_ledger WHERE id = v_redemption.wallet_ledger_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'REDEEM_LEDGER_NOT_FOUND'; END IF;
    RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id,
      v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits,
      v_ledger.idempotency_key, v_ledger.created_at, v_redemption.id;
    RETURN;
  END IF;

  SELECT * INTO v_code
  FROM billing_redeem_codes
  WHERE code_hash = p_code_hash
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REDEEM_CODE_NOT_FOUND'; END IF;
  IF v_code.status <> 'active' THEN RAISE EXCEPTION 'REDEEM_CODE_INACTIVE'; END IF;
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at <= now() THEN RAISE EXCEPTION 'REDEEM_CODE_EXPIRED'; END IF;
  IF v_code.redeemed_count >= v_code.max_redemptions THEN RAISE EXCEPTION 'REDEEM_CODE_EXHAUSTED'; END IF;

  SELECT * INTO v_redemption
  FROM billing_redeem_code_redemptions
  WHERE redeem_code_id = v_code.id AND user_id = p_user_id
  FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'REDEEM_CODE_ALREADY_REDEEMED'; END IF;

  SELECT * INTO v_ledger
  FROM app.wallet_credit(
    p_user_id, v_code.credits, NULL, p_idempotency_key,
    v_code.id::text, 'redeem',
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('redeemCodeId', v_code.id, 'codeHash', p_code_hash)
  );

  INSERT INTO billing_redeem_code_redemptions (
    redeem_code_id, tenant_id, user_id, wallet_ledger_id, idempotency_key
  ) VALUES (
    v_code.id, p_tenant_id, p_user_id, v_ledger.id, p_idempotency_key
  ) RETURNING * INTO v_redemption;

  UPDATE billing_redeem_codes
  SET redeemed_count = redeemed_count + 1
  WHERE id = v_code.id;

  RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id,
    v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits,
    v_ledger.idempotency_key, v_ledger.created_at, v_redemption.id;
END;
$$;

REVOKE ALL ON FUNCTION app.wallet_redeem_code(uuid, uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.wallet_redeem_code(uuid, uuid, text, text, jsonb) TO SESSION_USER;

RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM tapflow_wallet_callback;
REVOKE tapflow_wallet_callback FROM CURRENT_USER GRANTED BY CURRENT_USER;
