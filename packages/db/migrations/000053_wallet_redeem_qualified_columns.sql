-- Qualify redeem-code columns that collide with RETURNS TABLE output names.
-- Without table aliases, PostgreSQL resolves user_id as the output variable
-- and rejects the function before it can credit the wallet.

GRANT USAGE, CREATE ON SCHEMA app TO tapflow_wallet_callback;
GRANT tapflow_wallet_callback TO CURRENT_USER WITH INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
SET LOCAL ROLE tapflow_wallet_callback;

CREATE OR REPLACE FUNCTION app.wallet_credit(
  p_user_id uuid,
  p_amount numeric,
  p_expires_at timestamptz,
  p_idempotency_key text,
  p_source_id text,
  p_source_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid, wallet_id uuid, user_id uuid, tenant_id uuid, usage_event_id uuid,
  entry_type text, amount_credits numeric, idempotency_key text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_wallet billing_wallets%ROWTYPE;
BEGIN
  IF p_amount <= 0 OR p_idempotency_key = ''
    OR p_source_type NOT IN ('payment', 'redeem', 'admin_grant', 'migration') THEN
    RAISE EXCEPTION 'invalid wallet credit';
  END IF;

  INSERT INTO billing_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT ON CONSTRAINT billing_wallets_user_id_key DO NOTHING;

  SELECT * INTO v_wallet
  FROM billing_wallets AS wallet
  WHERE wallet.user_id = p_user_id
  FOR UPDATE;

  RETURN QUERY
  INSERT INTO billing_wallet_ledger (wallet_id, user_id, entry_type, amount_credits, idempotency_key, metadata)
  VALUES (
    v_wallet.id,
    p_user_id,
    CASE p_source_type
      WHEN 'payment' THEN 'payment'
      WHEN 'migration' THEN 'migration_credit'
      WHEN 'redeem' THEN 'redeem'
      ELSE 'admin_credit'
    END,
    p_amount,
    p_idempotency_key,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT ON CONSTRAINT billing_wallet_ledger_user_id_idempotency_key_key DO NOTHING
  RETURNING billing_wallet_ledger.id, billing_wallet_ledger.wallet_id, billing_wallet_ledger.user_id,
    billing_wallet_ledger.tenant_id, billing_wallet_ledger.usage_event_id, billing_wallet_ledger.entry_type,
    billing_wallet_ledger.amount_credits, billing_wallet_ledger.idempotency_key, billing_wallet_ledger.created_at;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT ledger.id, ledger.wallet_id, ledger.user_id, ledger.tenant_id, ledger.usage_event_id,
      ledger.entry_type, ledger.amount_credits, ledger.idempotency_key, ledger.created_at
    FROM billing_wallet_ledger AS ledger
    WHERE ledger.user_id = p_user_id AND ledger.idempotency_key = p_idempotency_key;
    RETURN;
  END IF;

  INSERT INTO billing_wallet_credit_grants (
    wallet_id, user_id, source_type, source_id, original_credits, remaining_credits, expires_at, metadata
  ) VALUES (
    v_wallet.id, p_user_id, p_source_type, p_source_id, p_amount, p_amount, p_expires_at,
    COALESCE(p_metadata, '{}'::jsonb)
  );
  UPDATE billing_wallets AS wallet
  SET balance_credits = wallet.balance_credits + p_amount, updated_at = now()
  WHERE wallet.id = v_wallet.id;
END;
$$;

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
  FROM billing_redeem_code_redemptions AS redemption
  WHERE redemption.user_id = p_user_id AND redemption.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO v_ledger FROM billing_wallet_ledger AS ledger WHERE ledger.id = v_redemption.wallet_ledger_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'REDEEM_LEDGER_NOT_FOUND'; END IF;
    RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id,
      v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits,
      v_ledger.idempotency_key, v_ledger.created_at, v_redemption.id;
    RETURN;
  END IF;

  SELECT * INTO v_code
  FROM billing_redeem_codes AS redeem_code
  WHERE redeem_code.code_hash = p_code_hash
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REDEEM_CODE_NOT_FOUND'; END IF;
  IF v_code.status <> 'active' THEN RAISE EXCEPTION 'REDEEM_CODE_INACTIVE'; END IF;
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at <= now() THEN RAISE EXCEPTION 'REDEEM_CODE_EXPIRED'; END IF;
  IF v_code.redeemed_count >= v_code.max_redemptions THEN RAISE EXCEPTION 'REDEEM_CODE_EXHAUSTED'; END IF;

  SELECT * INTO v_redemption
  FROM billing_redeem_code_redemptions AS redemption
  WHERE redemption.redeem_code_id = v_code.id AND redemption.user_id = p_user_id
  FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'REDEEM_CODE_ALREADY_REDEEMED'; END IF;

  SELECT credit.id, credit.wallet_id, credit.user_id, credit.tenant_id,
    NULL::uuid AS workflow_run_id, NULL::uuid AS node_run_id,
    credit.usage_event_id, credit.entry_type, credit.amount_credits,
    credit.idempotency_key, NULL::text AS description, NULL::jsonb AS metadata,
    credit.created_at
  INTO v_ledger
  FROM app.wallet_credit(
    p_user_id, v_code.credits, NULL, p_idempotency_key,
    v_code.id::text, 'redeem',
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('redeemCodeId', v_code.id, 'codeHash', p_code_hash)
  ) AS credit;

  INSERT INTO billing_redeem_code_redemptions (
    redeem_code_id, tenant_id, user_id, wallet_ledger_id, idempotency_key
  ) VALUES (
    v_code.id, p_tenant_id, p_user_id, v_ledger.id, p_idempotency_key
  ) RETURNING * INTO v_redemption;

  UPDATE billing_redeem_codes AS redeem_code
  SET redeemed_count = redeem_code.redeemed_count + 1
  WHERE redeem_code.id = v_code.id;

  RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id,
    v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits,
    v_ledger.idempotency_key, v_ledger.created_at, v_redemption.id;
END;
$$;

REVOKE ALL ON FUNCTION app.wallet_redeem_code(uuid, uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.wallet_redeem_code(uuid, uuid, text, text, jsonb) TO SESSION_USER;

RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM tapflow_wallet_callback;
GRANT SELECT, INSERT, UPDATE ON billing_redeem_code_redemptions TO tapflow_wallet_callback;
REVOKE tapflow_wallet_callback FROM CURRENT_USER GRANTED BY CURRENT_USER;
