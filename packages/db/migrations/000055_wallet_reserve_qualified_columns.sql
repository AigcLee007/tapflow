-- Qualify wallet-reserve columns that collide with RETURNS TABLE output names.
-- PostgreSQL otherwise resolves names such as user_id against the PL/pgSQL
-- output variable before the table column and raises 42702.

GRANT USAGE, CREATE ON SCHEMA app TO tapflow_wallet_callback;
GRANT tapflow_wallet_callback TO CURRENT_USER WITH INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
SET LOCAL ROLE tapflow_wallet_callback;

-- Signature: CREATE OR REPLACE FUNCTION app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb)
CREATE OR REPLACE FUNCTION app.wallet_reserve(
  p_user_id uuid,
  p_tenant_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_workflow_run_id uuid DEFAULT NULL,
  p_node_run_id uuid DEFAULT NULL,
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
  v_grant billing_wallet_credit_grants%ROWTYPE;
  v_ledger billing_wallet_ledger%ROWTYPE;
  v_need numeric;
  v_take numeric;
BEGIN
  IF p_amount <= 0 OR p_idempotency_key = '' THEN
    RAISE EXCEPTION 'invalid wallet reserve';
  END IF;
  IF NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
    AND current_setting('app.user_id', true)::uuid <> p_user_id THEN
    RAISE EXCEPTION 'WALLET_FORBIDDEN';
  END IF;

  SELECT wallet.* INTO v_wallet
  FROM billing_wallets AS wallet
  WHERE wallet.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_wallet.status <> 'active' THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  SELECT ledger.* INTO v_ledger
  FROM billing_wallet_ledger AS ledger
  WHERE ledger.user_id = p_user_id
    AND ledger.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_ledger.entry_type <> 'reserve'
      OR v_ledger.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_ledger.amount_credits <> -p_amount THEN
      RAISE EXCEPTION 'WALLET_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id,
      v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits,
      v_ledger.idempotency_key, v_ledger.created_at;
    RETURN;
  END IF;

  PERFORM app.wallet_expire_due_for_user(p_user_id, now());
  SELECT wallet.* INTO v_wallet
  FROM billing_wallets AS wallet
  WHERE wallet.user_id = p_user_id
  FOR UPDATE;
  IF v_wallet.balance_credits - v_wallet.reserved_credits < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  INSERT INTO billing_wallet_ledger (
    wallet_id, user_id, tenant_id, workflow_run_id, node_run_id,
    entry_type, amount_credits, idempotency_key, metadata
  ) VALUES (
    v_wallet.id, p_user_id, p_tenant_id, p_workflow_run_id, p_node_run_id,
    'reserve', -p_amount, p_idempotency_key, COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING * INTO v_ledger;

  v_need := p_amount;
  FOR v_grant IN
    SELECT credit_grant.*
    FROM billing_wallet_credit_grants AS credit_grant
    WHERE credit_grant.wallet_id = v_wallet.id
      AND credit_grant.status = 'active'
      AND (credit_grant.expires_at IS NULL OR credit_grant.expires_at > now())
      AND credit_grant.remaining_credits > credit_grant.reserved_credits
    ORDER BY credit_grant.expires_at ASC NULLS LAST,
             credit_grant.created_at ASC,
             credit_grant.id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;
    v_take := LEAST(v_need, v_grant.remaining_credits - v_grant.reserved_credits);
    UPDATE billing_wallet_credit_grants AS credit_grant
    SET reserved_credits = credit_grant.reserved_credits + v_take,
        updated_at = now()
    WHERE credit_grant.id = v_grant.id;
    INSERT INTO billing_wallet_credit_reservations (
      wallet_id, user_id, wallet_ledger_id, credit_grant_id, amount_credits, metadata
    ) VALUES (
      v_wallet.id, p_user_id, v_ledger.id, v_grant.id, v_take,
      COALESCE(p_metadata, '{}'::jsonb)
    );
    v_need := v_need - v_take;
  END LOOP;

  IF v_need > 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  UPDATE billing_wallets AS wallet
  SET reserved_credits = wallet.reserved_credits + p_amount,
      updated_at = now()
  WHERE wallet.id = v_wallet.id;

  RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id,
    v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits,
    v_ledger.idempotency_key, v_ledger.created_at;
END;
$$;

REVOKE ALL ON FUNCTION app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb) TO SESSION_USER;

RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM tapflow_wallet_callback;
REVOKE tapflow_wallet_callback FROM CURRENT_USER GRANTED BY CURRENT_USER;
