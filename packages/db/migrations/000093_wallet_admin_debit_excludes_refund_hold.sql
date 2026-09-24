-- Keep administrative debits from consuming credits held by an in-flight refund.
GRANT USAGE, CREATE ON SCHEMA app TO tapflow_wallet_callback;
GRANT tapflow_wallet_callback TO CURRENT_USER WITH INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
SET LOCAL ROLE tapflow_wallet_callback;

CREATE OR REPLACE FUNCTION app.wallet_admin_debit(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_tenant_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_description text,
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
  v_ledger billing_wallet_ledger%ROWTYPE;
  v_grant billing_wallet_credit_grants%ROWTYPE;
  v_need numeric := p_amount;
  v_take numeric;
  v_allocations jsonb := '[]'::jsonb;
BEGIN
  IF p_target_user_id IS NULL OR p_tenant_id IS NULL
    OR p_amount <= 0 OR COALESCE(p_idempotency_key, '') = '' THEN
    RAISE EXCEPTION 'invalid wallet admin debit';
  END IF;

  IF NOT app.current_is_system_admin() THEN
    RAISE EXCEPTION 'WALLET_FORBIDDEN';
  END IF;
  IF app.current_user_id() IS NOT NULL THEN
    IF app.current_user_id() <> p_actor_user_id THEN
      RAISE EXCEPTION 'WALLET_FORBIDDEN';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('wallet-admin:' || p_idempotency_key, 0));

  SELECT ledger.* INTO v_ledger
  FROM billing_wallet_ledger AS ledger
  WHERE ledger.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_ledger.user_id IS DISTINCT FROM p_target_user_id
      OR v_ledger.entry_type <> 'admin_debit'
      OR v_ledger.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_ledger.amount_credits <> p_amount THEN
      RAISE EXCEPTION 'WALLET_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id,
      v_ledger.tenant_id, v_ledger.usage_event_id, v_ledger.entry_type,
      v_ledger.amount_credits, v_ledger.idempotency_key, v_ledger.created_at;
    RETURN;
  END IF;

  PERFORM app.wallet_expire_due_for_user(p_target_user_id, now());

  SELECT wallet.* INTO v_wallet
  FROM billing_wallets AS wallet
  WHERE wallet.user_id = p_target_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_wallet.status <> 'active'
    OR v_wallet.balance_credits - v_wallet.reserved_credits < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  FOR v_grant IN
    SELECT credit_grant.*
    FROM billing_wallet_credit_grants AS credit_grant
    WHERE credit_grant.wallet_id = v_wallet.id
      AND credit_grant.status = 'active'
      AND NOT credit_grant.refund_hold
      AND (credit_grant.expires_at IS NULL OR credit_grant.expires_at > now())
      AND credit_grant.remaining_credits > credit_grant.reserved_credits
    ORDER BY expires_at ASC NULLS LAST, created_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;

    v_take := LEAST(v_need, v_grant.remaining_credits - v_grant.reserved_credits);
    UPDATE billing_wallet_credit_grants AS credit_grant
    SET remaining_credits = credit_grant.remaining_credits - v_take,
        status = CASE
          WHEN credit_grant.remaining_credits - v_take = 0 THEN 'exhausted'
          ELSE credit_grant.status
        END,
        updated_at = now()
    WHERE credit_grant.id = v_grant.id;

    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'creditGrantId', v_grant.id,
      'amountCredits', v_take
    ));
    v_need := v_need - v_take;
  END LOOP;

  IF v_need > 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  INSERT INTO billing_wallet_ledger (
    wallet_id,
    user_id,
    tenant_id,
    entry_type,
    amount_credits,
    idempotency_key,
    description,
    metadata
  ) VALUES (
    v_wallet.id,
    p_target_user_id,
    p_tenant_id,
    'admin_debit',
    p_amount,
    p_idempotency_key,
    p_description,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'actorUserId', p_actor_user_id,
      'creditGrantAllocations', v_allocations
    )
  ) RETURNING * INTO v_ledger;

  UPDATE billing_wallets AS wallet
  SET balance_credits = wallet.balance_credits - p_amount,
      updated_at = now()
  WHERE wallet.id = v_wallet.id;

  RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id,
    v_ledger.tenant_id, v_ledger.usage_event_id, v_ledger.entry_type,
    v_ledger.amount_credits, v_ledger.idempotency_key, v_ledger.created_at;
END;
$$;

REVOKE ALL ON FUNCTION app.wallet_admin_debit(uuid, uuid, uuid, numeric, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.wallet_admin_debit(uuid, uuid, uuid, numeric, text, text, jsonb) TO SESSION_USER;

DO $$
DECLARE
  runtime_role name := COALESCE(NULLIF(current_setting('app.api_database_role', true), ''), session_user);
BEGIN
  IF runtime_role = 'tapflow_wallet_callback' THEN
    RAISE EXCEPTION 'API_DATABASE_ROLE must be the runtime API role, not the callback owner';
  END IF;
  EXECUTE format('GRANT EXECUTE ON FUNCTION app.wallet_admin_debit(uuid, uuid, uuid, numeric, text, text, jsonb) TO %I', runtime_role);
END;
$$;

RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM tapflow_wallet_callback;
REVOKE tapflow_wallet_callback FROM CURRENT_USER GRANTED BY CURRENT_USER;
